import { Hono } from 'hono';
import { z } from 'zod';
import { Env, db } from './db.js';
import { generateId, sendData, toPlainText } from './utils.js';

const notes = new Hono<{ Bindings: Env; Variables: { jwtPayload: { userId: string } } }>();

const CreateNoteSchema = z.object({
  contentMarkdown: z.string().min(1),
  tagIds: z.array(z.string()).default([]),
  source: z.string().min(1).default('worker'),
  recordedAt: z.string().optional(),
});

notes.get('/', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const q = c.req.query('q');
  const tagIds = c.req.query('tagIds');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '100');
  const offset = (page - 1) * pageSize;

  let where = 'userId = ? AND deletedAt IS NULL';
  const params: any[] = [userId];

  if (q) {
    where += ' AND contentPlain LIKE ?';
    params.push(`%${q}%`);
  }
  if (from) {
    where += ' AND createdAt >= ?';
    params.push(from);
  }
  if (to) {
    where += ' AND createdAt <= ?';
    params.push(to);
  }
  if (tagIds) {
    // Simplified tagIds approach. For many tags this needs a subquery.
    const tags = tagIds.split(',');
    if (tags.length === 1) {
      where += ' AND id IN (SELECT noteId FROM NoteTag WHERE tagId = ?)';
      params.push(tags[0]);
    } else {
      where += ` AND id IN (SELECT noteId FROM NoteTag WHERE tagId IN (${tags.map(() => '?').join(',')}))`;
      params.push(...tags);
    }
  }

  // Get total count
  const { results: countList } = await c.env.DB
    .prepare(`SELECT COUNT(*) as total FROM Note WHERE ${where}`)
    .bind(...params)
    .all();
  const total = (countList[0] as any).total || 0;

  // Get items
  const { results: notesList } = await c.env.DB
    .prepare(`SELECT * FROM Note WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, offset)
    .all();

  // Attach tags to results
  const items = await Promise.all(notesList.map(async (n: any) => {
    const tIds = await db.findTagsByNoteId(c.env.DB, n.id);
    return { ...n, tagIds: tIds };
  }));

  return c.json(sendData({ items, page, pageSize, total }));
});

notes.post('/reclassify-untagged', async (c) => {
  // Placeholder: Real implementation would trigger AI re-classification
  return c.json(sendData({ reclassifiedCount: 0, total: 0 }));
});

notes.post('/', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const body = CreateNoteSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid note payload', details: body.error.flatten() }, 400);

  const id = generateId();
  const { contentMarkdown, source, recordedAt, tagIds } = body.data;
  const contentPlain = toPlainText(contentMarkdown);
  const now = new Date().toISOString();

  // Create the note
  await c.env.DB
    .prepare('INSERT INTO Note (id, userId, contentMd, contentPlain, source, recordedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, contentMarkdown, contentPlain, source, recordedAt || now, now, now)
    .run();

  // Add tags
  if (tagIds.length > 0) {
    const stmts = tagIds.map(tagId =>
      c.env.DB.prepare('INSERT INTO NoteTag (noteId, tagId) VALUES (?, ?)').bind(id, tagId)
    );
    await c.env.DB.batch(stmts);
  }

  return c.json(sendData({ id, createdAt: now }));
});

notes.get('/:id', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const noteId = c.req.param('id');
  const note = await db.findNoteById(c.env.DB, userId, noteId);
  if (!note) return c.json({ error: 'Note not found' }, 404);

  const tagIds = await db.findTagsByNoteId(c.env.DB, noteId);
  return c.json(sendData({ ...note, tagIds }));
});

notes.patch('/:id', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const noteId = c.req.param('id');
  const body = await c.req.json(); // Basic patch for now
  const { contentMarkdown, archived, tagIds } = body;

  const existing = await db.findNoteById(c.env.DB, userId, noteId);
  if (!existing) return c.json({ error: 'Note not found' }, 404);

  const now = new Date().toISOString();
  if (contentMarkdown !== undefined) {
    const plain = toPlainText(contentMarkdown);
    await c.env.DB
      .prepare('UPDATE Note SET contentMd = ?, contentPlain = ?, updatedAt = ? WHERE id = ?')
      .bind(contentMarkdown, plain, now, noteId)
      .run();
  }

  if (archived !== undefined) {
    await c.env.DB
      .prepare('UPDATE Note SET archived = ?, updatedAt = ? WHERE id = ?')
      .bind(archived ? 1 : 0, now, noteId)
      .run();
  }

  if (tagIds) {
    await c.env.DB.prepare('DELETE FROM NoteTag WHERE noteId = ?').bind(noteId).run();
    if (tagIds.length > 0) {
      const stmts = tagIds.map((tagId: string) =>
        c.env.DB.prepare('INSERT INTO NoteTag (noteId, tagId) VALUES (?, ?)').bind(noteId, tagId)
      );
      await c.env.DB.batch(stmts);
    }
  }

  return c.json(sendData({ updated: true }));
});

notes.delete('/:id', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const noteId = c.req.param('id');
  const now = new Date().toISOString();
  const res = await c.env.DB
    .prepare('UPDATE Note SET deletedAt = ? WHERE id = ? AND userId = ?')
    .bind(now, noteId, userId)
    .run();

  if (res.meta.changes === 0) return c.json({ error: 'Note not found' }, 404);
  return c.json(sendData({ deleted: true }));
});

export { notes };
