import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';
import { markMutationProcessed } from '../services/idempotency.js';
import { toPlainText } from '../utils/text.js';
import { logChange } from '../services/changeLog.js';

const ChangeSchema = z.object({
  clientMutationId: z.string().min(1).max(100),
  entityType: z.enum(['note', 'tag']),
  op: z.enum(['upsert', 'delete']),
  entityId: z.string().uuid(),
  payload: z.unknown().optional(),
  clientTime: z.string().optional(),
});

export async function registerSyncRoutes(app: FastifyInstance) {
  app.post('/api/sync/push', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const schema = z.object({ changes: z.array(ChangeSchema).max(200) });
    const body = schema.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid sync payload', body.error.flatten());

    let accepted = 0;
    for (const change of body.data.changes) {
      const firstTime = await markMutationProcessed(userId, change.clientMutationId);
      if (!firstTime) continue;

      if (change.entityType === 'note') {
        await applyNoteChange(userId, change);
      } else {
        await applyTagChange(userId, change);
      }
      accepted += 1;
    }

    const last = await prisma.changeLog.findFirst({
      where: { userId },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return sendData(reply, { accepted, lastChangeLogId: last ? last.id : 0 });
  });

  app.get('/api/sync/pull', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const schema = z.object({
      since: z.coerce.number().int().nonnegative().default(0),
      limit: z.coerce.number().int().positive().max(500).default(200),
    });
    const query = schema.safeParse(req.query);
    if (!query.success) throw badRequest('Invalid query', query.error.flatten());

    const changes = await prisma.changeLog.findMany({
      where: { userId, id: { gt: query.data.since } },
      orderBy: { id: 'asc' },
      take: query.data.limit,
      select: { id: true, entityType: true, entityId: true, op: true, payload: true },
    });

    const lastChangeLogId = changes.length ? changes[changes.length - 1]!.id : query.data.since;
    return sendData(reply, {
      changes: changes.map((c) => ({
        changeLogId: c.id,
        entityType: c.entityType,
        op: c.op,
        entityId: c.entityId,
        payload: c.payload ?? undefined,
      })),
      lastChangeLogId,
    });
  });
}

async function applyNoteChange(
  userId: string,
  change: z.infer<typeof ChangeSchema>,
): Promise<void> {
  if (change.op === 'delete') {
    await prisma.note.updateMany({ where: { id: change.entityId, userId }, data: { deletedAt: new Date() } });
    await logChange({ userId, entityType: 'note', entityId: change.entityId, op: 'delete' });
    return;
  }

  const payloadSchema = z.object({
    contentMarkdown: z.string().min(1),
    tagIds: z.array(z.string().uuid()).optional(),
    archived: z.boolean().optional(),
    source: z.string().optional(),
  });
  const parsed = payloadSchema.safeParse(change.payload);
  if (!parsed.success) throw badRequest('Invalid note payload in sync', parsed.error.flatten());

  const contentPlain = toPlainText(parsed.data.contentMarkdown);
  const existing = await prisma.note.findFirst({ where: { id: change.entityId, userId } });
  if (existing) {
    await prisma.note.update({
      where: { id: change.entityId },
      data: {
        contentMd: parsed.data.contentMarkdown,
        contentPlain,
        archived: parsed.data.archived ?? existing.archived,
      },
    });
  } else {
    await prisma.note.create({
      data: {
        id: change.entityId,
        userId,
        contentMd: parsed.data.contentMarkdown,
        contentPlain,
        archived: parsed.data.archived ?? false,
        source: parsed.data.source ?? 'miniprogram',
      },
    });
  }

  if (parsed.data.tagIds) {
    await prisma.noteTag.deleteMany({ where: { noteId: change.entityId } });
    await prisma.noteTag.createMany({
      data: parsed.data.tagIds.map((tagId) => ({ noteId: change.entityId, tagId })),
    });
  }

  await logChange({ userId, entityType: 'note', entityId: change.entityId, op: 'upsert', payload: { id: change.entityId } });
}

async function applyTagChange(userId: string, change: z.infer<typeof ChangeSchema>): Promise<void> {
  // Phase1：小程序端默认不做复杂标签管理；这里保留最小 upsert/delete 能力，用于跨端同步不报错
  if (change.op === 'delete') {
    await prisma.tag.deleteMany({ where: { id: change.entityId, userId } });
    await logChange({ userId, entityType: 'tag', entityId: change.entityId, op: 'delete' });
    return;
  }

  const payloadSchema = z.object({
    name: z.string().min(1).max(50),
    color: z.string().max(20).optional(),
    parentId: z.string().uuid().nullable().optional(),
    path: z.string().min(1),
    depth: z.number().int().positive(),
  });
  const parsed = payloadSchema.safeParse(change.payload);
  if (!parsed.success) throw badRequest('Invalid tag payload in sync', parsed.error.flatten());

  await prisma.tag.upsert({
    where: { id: change.entityId },
    update: { name: parsed.data.name, color: parsed.data.color, parentId: parsed.data.parentId ?? null, path: parsed.data.path, depth: parsed.data.depth },
    create: { id: change.entityId, userId, name: parsed.data.name, color: parsed.data.color, parentId: parsed.data.parentId ?? null, path: parsed.data.path, depth: parsed.data.depth },
  });
  await logChange({ userId, entityType: 'tag', entityId: change.entityId, op: 'upsert', payload: { id: change.entityId } });
}

