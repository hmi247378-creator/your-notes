import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { sign } from 'hono/jwt';
import { Env, db } from './db.js';
import { generateId, sendData } from './utils.js';

const auth = new Hono<{ Bindings: Env }>();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nickname: z.string().min(1).max(50).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

auth.post('/register', async (c) => {
  const body = RegisterSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: { message: 'Invalid register payload', details: body.error.flatten() } }, 400);

  const { email, password, nickname } = body.data;
  const existing = await db.findUserByEmail(c.env.DB, email);
  if (existing) return c.json({ error: { message: '邮箱已注册，请直接登录' } }, 409);

  const id = generateId();
  const passwordHash = await bcrypt.hash(password, 10);
  await db.createUser(c.env.DB, { id, email, passwordHash, nickname });

  const token = await sign({ userId: id }, c.env.JWT_SECRET);
  return c.json(sendData({ token, user: { id, nickname } }));
});

auth.post('/login', async (c) => {
  const body = LoginSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: { message: 'Invalid login payload', details: body.error.flatten() } }, 400);

  const { email, password } = body.data;
  const user = await db.findUserByEmail(c.env.DB, email);
  if (!user || !user.passwordHash) return c.json({ error: { message: '邮箱或密码错误' } }, 401);

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return c.json({ error: { message: '邮箱或密码错误' } }, 401);

  const token = await sign({ userId: user.id }, c.env.JWT_SECRET);
  return c.json(sendData({ token, user: { id: user.id, nickname: user.nickname } }));
});

auth.get('/me', async (c) => {
  const payload = c.get('jwtPayload') as { userId: string };
  const user = await db.findUserById(c.env.DB, payload.userId);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return c.json(sendData({ id: user.id, nickname: user.nickname }));
});

export { auth };
