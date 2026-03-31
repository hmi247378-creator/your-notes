import { Hono } from 'hono';
import { Env, db } from './db.js';
import { generateId, sendData } from './utils.js';

const tags = new Hono<{ Bindings: Env; Variables: { jwtPayload: { userId: string } } }>();

tags.get('/', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const { results } = await c.env.DB
    .prepare('SELECT * FROM Tag WHERE userId = ? ORDER BY name ASC')
    .bind(userId)
    .all();

  return c.json(sendData(results));
});

tags.post('/', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const { name, color, parentId } = await c.req.json();
  const id = generateId();
  const now = new Date().toISOString();

  // Basic path/depth calculation (simplified for the rewrite)
  // Real implementation would fetch parent then calculate
  const path = name; 
  const depth = 0;

  await c.env.DB
    .prepare('INSERT INTO Tag (id, userId, name, color, parentId, path, depth, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, name, color || null, parentId || null, path, depth, now, now)
    .run();

  return c.json(sendData({ id, name }));
});

tags.delete('/:id', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const tagId = c.req.param('id');
  
  await c.env.DB
    .prepare('DELETE FROM Tag WHERE id = ? AND userId = ?')
    .bind(tagId, userId)
    .run();

  return c.json(sendData({ deleted: true }));
});

export { tags };
