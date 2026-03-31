import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest, notFound } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';

const CreateReminderSchema = z.object({
  noteId: z.string().uuid(),
  /** 提醒日期时间，支持 ISO 8601 或 YYYY-MM-DD、YYYY-MM-DDTHH:mm 等格式 */
  remindAt: z.string().min(1).optional(),
});

const UpdateReminderSchema = z.object({
  status: z.enum(['待处理', '进行中', '已完成']).optional(),
  remindAt: z.string().datetime().optional().nullable(),
});

export async function registerReminderRoutes(app: FastifyInstance) {
  /** 将笔记加入提醒事项 */
  app.post('/api/reminders', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const body = CreateReminderSchema.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid payload', body.error.flatten());

    const note = await prisma.note.findFirst({
      where: { id: body.data.noteId, userId, deletedAt: null },
      select: { id: true, contentPlain: true, recordedAt: true, createdAt: true },
    });
    if (!note) throw notFound('Note not found');

    const existing = await prisma.reminder.findFirst({
      where: { userId, noteId: body.data.noteId },
      select: { id: true, noteId: true, status: true, remindAt: true, createdAt: true },
    });

    let remindAtVal: Date | undefined;
    if (body.data.remindAt) {
      const d = new Date(body.data.remindAt);
      if (isNaN(d.getTime())) throw badRequest('无效的提醒日期格式');
      remindAtVal = d;
    }

    if (existing) {
      const updated = remindAtVal
        ? await prisma.reminder.update({
            where: { id: existing.id },
            data: { remindAt: remindAtVal },
            select: { id: true, noteId: true, status: true, remindAt: true, createdAt: true },
          })
        : existing;
      return sendData(reply, {
        id: updated.id,
        noteId: updated.noteId,
        status: updated.status,
        remindAt: updated.remindAt,
        createdAt: updated.createdAt,
        content: note.contentPlain,
        recordDate: note.recordedAt ?? note.createdAt,
      });
    }

    const created = await prisma.reminder.create({
      data: { userId, noteId: body.data.noteId, ...(remindAtVal ? { remindAt: remindAtVal } : {}) },
      select: {
        id: true,
        noteId: true,
        status: true,
        remindAt: true,
        createdAt: true,
      },
    });

    return sendData(reply, {
      id: created.id,
      noteId: created.noteId,
      status: created.status,
      remindAt: created.remindAt,
      createdAt: created.createdAt,
      content: note.contentPlain,
      recordDate: note.recordedAt ?? note.createdAt,
    });
  });

  /** 获取提醒事项列表 */
  app.get('/api/reminders', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const querySchema = z.object({
      q: z.string().optional(),
      status: z.enum(['待处理', '进行中', '已完成']).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    });
    const q = querySchema.safeParse(req.query);
    if (!q.success) throw badRequest('Invalid query', q.error.flatten());

    const where: any = {
      userId,
      ...(q.data.status ? { status: q.data.status } : {}),
      ...(q.data.q?.trim()
        ? { note: { contentPlain: { contains: q.data.q.trim(), mode: 'insensitive' } } }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.reminder.count({ where }),
      prisma.reminder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.data.page - 1) * q.data.pageSize,
        take: q.data.pageSize,
        select: {
          id: true,
          noteId: true,
          status: true,
          remindAt: true,
          createdAt: true,
          note: {
            select: {
              contentPlain: true,
              recordedAt: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const mapped = items.map((r) => ({
      id: r.id,
      noteId: r.noteId,
      content: r.note.contentPlain,
      recordDate: r.note.recordedAt ?? r.note.createdAt,
      status: r.status,
      remindAt: r.remindAt,
      createdAt: r.createdAt,
    }));

    return sendData(reply, {
      items: mapped,
      page: q.data.page,
      pageSize: q.data.pageSize,
      total,
    });
  });

  /** 更新提醒状态 */
  app.patch('/api/reminders/:id', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const id = z.string().uuid().parse((req.params as any).id);
    const body = UpdateReminderSchema.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid payload', body.error.flatten());

    const reminder = await prisma.reminder.findFirst({
      where: { id, userId },
    });
    if (!reminder) throw notFound('Reminder not found');

    const updated = await prisma.reminder.update({
      where: { id },
      data: {
        ...(body.data.status != null ? { status: body.data.status } : {}),
        ...(body.data.remindAt !== undefined ? { remindAt: body.data.remindAt ? new Date(body.data.remindAt) : null } : {}),
      },
      select: {
        id: true,
        noteId: true,
        status: true,
        remindAt: true,
        createdAt: true,
      },
    });

    return sendData(reply, updated);
  });

  /** 从提醒中移除 */
  app.delete('/api/reminders/:id', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const id = z.string().uuid().parse((req.params as any).id);

    const reminder = await prisma.reminder.findFirst({
      where: { id, userId },
    });
    if (!reminder) throw notFound('Reminder not found');

    await prisma.reminder.delete({ where: { id } });
    return sendData(reply, { ok: true });
  });
}
