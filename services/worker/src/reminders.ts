import { Hono } from 'hono';
import { z } from 'zod';
import { Env, db } from './db.js';
import { sendData, generateId } from './utils.js';

const reminders = new Hono<{ Bindings: Env; Variables: { jwtPayload: { userId: string } } }>();

const CreateReminderSchema = z.object({
  noteId: z.string(),
  remindAt: z.string().optional(),
});

reminders.get('/', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const status = c.req.query('status');
  
  let sql = `
    SELECT r.*, n.contentPlain as content, n.recordedAt, n.createdAt as noteCreatedAt
    FROM Reminder r
    JOIN Note n ON r.noteId = n.id
    WHERE r.userId = ?
  `;
  const params: any[] = [userId];

  if (status) {
    sql += ' AND r.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY r.createdAt DESC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<any>();

  const mapped = results.map(r => ({
    id: r.id,
    noteId: r.noteId,
    content: r.content,
    recordDate: r.recordedAt || r.noteCreatedAt,
    status: r.status,
    remindAt: r.remindAt,
    createdAt: r.createdAt
  }));

  return c.json(sendData({ items: mapped, total: mapped.length }));
});

reminders.post('/', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const bodyJson = await c.req.json().catch(() => ({}));
  const body = CreateReminderSchema.safeParse(bodyJson);
  if (!body.success) return c.json({ error: `Invalid payload: ${JSON.stringify(body.error.flatten())}. Received: ${JSON.stringify(bodyJson)}` }, 400);

  const { noteId, remindAt } = body.data;
  
  // Verify note exists
  const note = await db.findNoteById(c.env.DB, userId, noteId);
  if (!note) return c.json({ error: 'Note not found' }, 404);

  // Check if reminder already exists
  const existing = await c.env.DB
    .prepare('SELECT id FROM Reminder WHERE userId = ? AND noteId = ?')
    .bind(userId, noteId)
    .first();

  const now = new Date().toISOString();
  if (existing) {
    if (remindAt) {
      await c.env.DB
        .prepare('UPDATE Reminder SET remindAt = ?, updatedAt = ? WHERE userId = ? AND noteId = ?')
        .bind(remindAt, now, userId, noteId)
        .run();
    }
    return c.json(sendData({ updated: true }));
  }

  const id = generateId();
  await c.env.DB
    .prepare('INSERT INTO Reminder (id, userId, noteId, status, remindAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, noteId, '待处理', remindAt || null, now, now)
    .run();

  return c.json(sendData({ id, status: '待处理', remindAt, createdAt: now }));
});

reminders.patch('/:id', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const id = c.req.param('id');
  const { status, remindAt } = await c.req.json() as any;

  const now = new Date().toISOString();
  let sql = 'UPDATE Reminder SET updatedAt = ?';
  const params: any[] = [now];

  if (status) {
    sql += ', status = ?';
    params.push(status);
  }
  if (remindAt !== undefined) {
    sql += ', remindAt = ?';
    params.push(remindAt);
  }

  sql += ' WHERE id = ? AND userId = ?';
  params.push(id, userId);

  await c.env.DB.prepare(sql).bind(...params).run();
  return c.json(sendData({ updated: true }));
});

reminders.delete('/:id', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const id = c.req.param('id');
  
  await c.env.DB.prepare('DELETE FROM Reminder WHERE id = ? AND userId = ?').bind(id, userId).run();
  return c.json(sendData({ deleted: true }));
});

export { reminders };
