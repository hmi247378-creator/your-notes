import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest, conflict, unauthorized } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nickname: z.string().min(1).max(50).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply) => {
    const body = RegisterSchema.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid register payload', body.error.flatten());

    const passwordHash = await bcrypt.hash(body.data.password, 10);
    let user: { id: string; nickname: string | null };
    try {
      user = await prisma.user.create({
        data: { email: body.data.email, passwordHash, nickname: body.data.nickname },
        select: { id: true, nickname: true, email: true },
      });
    } catch (e: any) {
      // Prisma unique constraint violation
      if (e?.code === 'P2002') throw conflict('邮箱已注册，请直接登录');
      throw e;
    }
    const token = app.jwt.sign({ userId: user.id });
    return sendData(reply, { token, user });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = LoginSchema.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid login payload', body.error.flatten());

    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (!user?.passwordHash) throw unauthorized('邮箱或密码错误');

    const ok = await bcrypt.compare(body.data.password, user.passwordHash);
    if (!ok) throw unauthorized('邮箱或密码错误');

    const token = app.jwt.sign({ userId: user.id });
    return sendData(reply, { token, user: { id: user.id, nickname: user.nickname, email: user.email } });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true, email: true } });
    if (!user) throw unauthorized();
    return sendData(reply, user);
  });
}

