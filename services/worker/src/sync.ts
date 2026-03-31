import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from './db.js';
import { sendData, toPlainText } from './utils.js';

const sync = new Hono<{ Bindings: Env; Variables: { jwtPayload: { userId: string } } }>();

const ChangeSchema = z.object({
  clientMutationId: z.string().min(1).max(100),
  entityType: z.enum(['note', 'tag']),
  op: z.enum(['upsert', 'delete']),
  entityId: z.string(),
  payload: z.any().optional(),
});

sync.post('/push', async (c) => {
  const userId = c.get('jwtPayload').userId;
  const { changes } = await c.req.json() as { changes: any[] };
  if (!changes || !Array.isArray(changes)) return c.json({ error: 'Invalid payload' }, 400);

  let accepted = 0;
  for (const change of changes) {
    const parsed = ChangeSchema.safeParse(change);
    if (!parsed.success) continue;

    // 1. Idempotency check
    const existing = await c.env.DB
      .prepare('SELECT id FROM ProcessedMutation WHERE userId = ? AND clientMutationId = ?')
      .bind(userId, parsed.data.clientMutationId)
      .first();
    
    if (existing) continue;

    const now = new Date().toISOString();
    
    // 2. Apply change
    if (parsed.data.entityType === 'note') {
      if (parsed.data.op === 'delete') {
        await c.env.DB.prepare('UPDATE Note SET deletedAt = ? WHERE id = ? AND userId = ?').bind(now, parsed.data.entityId, userId).run();
      } else {
        const p = parsed.data.payload || {};
        const plain = toPlainText(p.contentMarkdown || '');
        await c.env.DB
          .prepare(`
            INSERT INTO Note (id, userId, contentMd, contentPlain, source, archived, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              contentMd = excluded.contentMd,
              contentPlain = excluded.contentPlain,
              archived = excluded.archived,
              updatedAt = excluded.updatedAt
          `)
          .bind(parsed.data.entityId, userId, p.contentMarkdown || '', plain, p.source || 'sync', p.archived ? 1 : 0, now, now)
          .run();
        
        if (p.tagIds && Array.isArray(p.tagIds)) {
          await c.env.DB.prepare('DELETE FROM NoteTag WHERE noteId = ?').bind(parsed.data.entityId).run();
          for (const tid of p.tagIds) {
            await c.env.DB.prepare('INSERT INTO NoteTag (noteId, tagId) VALUES (?, ?)').bind(parsed.data.entityId, tid).run();
          }
        }
      }
    } else if (parsed.data.entityType === 'tag') {
        const p = parsed.data.payload || {};
        if (parsed.data.op === 'delete') {
            await c.env.DB.prepare('DELETE FROM Tag WHERE id = ? AND userId = ?').bind(parsed.data.entityId, userId).run();
        } else {
            await c.env.DB.prepare(`
                INSERT INTO Tag (id, userId, name, color, parentId, path, depth, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    color = excluded.color,
                    parentId = excluded.parentId,
                    path = excluded.path,
                    depth = excluded.depth,
                    updatedAt = excluded.updatedAt
            `)
            .bind(parsed.data.entityId, userId, p.name || '', p.color || null, p.parentId || null, p.path || p.name, p.depth || 0, now, now)
            .run();
        }
    }

    // 3. Mark as processed & log change
    await c.env.DB.prepare('INSERT INTO ProcessedMutation (id, userId, clientMutationId, createdAt) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), userId, parsed.data.clientMutationId, now).run();
    await c.env.DB.prepare('INSERT INTO ChangeLog (userId, entityType, entityId, op, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, parsed.data.entityType, parsed.data.entityId, parsed.data.op, JSON.stringify(parsed.data.payload), now).run();
    
    accepted += 1;
  }

  const last = await c.env.DB.prepare('SELECT id FROM ChangeLog WHERE userId = ? ORDER BY id DESC LIMIT 1').bind(userId).first<{ id: number }>();
  return c.json(sendData({ accepted, lastChangeLogId: last ? last.id : 0 }));
});

sync.get('/pull', async (c) => {
    const userId = c.get('jwtPayload').userId;
    const since = parseInt(c.req.query('since') || '0');
    const limit = Math.min(parseInt(c.req.query('limit') || '200'), 500);

    const { results } = await c.env.DB
        .prepare('SELECT * FROM ChangeLog WHERE userId = ? AND id > ? ORDER BY id ASC LIMIT ?')
        .bind(userId, since, limit)
        .all<any>();

    const changes = results.map(r => ({
        changeLogId: r.id,
        entityType: r.entityType,
        op: r.op,
        entityId: r.entityId,
        payload: r.payload ? JSON.parse(r.payload) : undefined
    }));

    const lastChangeLogId = changes.length ? changes[changes.length - 1].changeLogId : since;
    return c.json(sendData({ changes, lastChangeLogId }));
});

export { sync };
