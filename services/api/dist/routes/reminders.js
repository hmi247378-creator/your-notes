import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest, notFound } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';
const CreateReminderSchema = z.object({
    /** 笔记 ID，支持实时生成的虚拟 ID (batch:xxx, date:xxx) */
    noteId: z.string().min(1),
    /** 提醒日期时间，支持 ISO 8601 或 YYYY-MM-DD、YYYY-MM-DDTHH:mm 等格式 */
    remindAt: z.string().min(1).optional(),
});
const UpdateReminderSchema = z.object({
    status: z.enum(['待处理', '进行中', '已完成']).optional(),
    remindAt: z.string().datetime().optional().nullable(),
});
export async function registerReminderRoutes(app) {
    /** 将笔记加入提醒事项 */
    app.post('/api/reminders', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const body = CreateReminderSchema.safeParse(req.body);
        if (!body.success) {
            console.error('Reminder validation failed:', body.error.format());
            throw badRequest(`Invalid payload: ${JSON.stringify(body.error.flatten())}`, body.error.flatten());
        }
        let targetNoteId = body.data.noteId;
        // 处理虚拟 ID：batch: 或 date:
        if (targetNoteId.startsWith('batch:')) {
            const batchId = targetNoteId.replace(/^batch:/, '');
            const firstNote = await prisma.note.findFirst({
                where: { batchId, userId, deletedAt: null },
                select: { id: true },
                orderBy: { createdAt: 'asc' },
            });
            if (!firstNote)
                throw notFound('Batch notes not found');
            targetNoteId = firstNote.id;
        }
        else if (targetNoteId.startsWith('date:')) {
            const dateStr = targetNoteId.replace(/^date:/, '');
            const from = new Date(dateStr + 'T00:00:00');
            const to = new Date(dateStr + 'T23:59:59.999');
            const firstNote = await prisma.note.findFirst({
                where: {
                    userId,
                    deletedAt: null,
                    batchId: null,
                    OR: [
                        { recordedAt: { gte: from, lte: to } },
                        { recordedAt: null, createdAt: { gte: from, lte: to } },
                    ],
                },
                select: { id: true },
                orderBy: { createdAt: 'asc' },
            });
            if (!firstNote)
                throw notFound('Notes for this date not found');
            targetNoteId = firstNote.id;
        }
        const note = await prisma.note.findFirst({
            where: { id: targetNoteId, userId, deletedAt: null },
            select: { id: true, contentPlain: true, recordedAt: true, createdAt: true },
        });
        if (!note)
            throw notFound('Note not found');
        const existing = await prisma.reminder.findFirst({
            where: { userId, noteId: targetNoteId },
            select: { id: true, noteId: true, status: true, remindAt: true, createdAt: true },
        });
        let remindAtVal;
        if (body.data.remindAt) {
            const d = new Date(body.data.remindAt);
            if (isNaN(d.getTime()))
                throw badRequest('无效的提醒日期格式');
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
            data: { userId, noteId: targetNoteId, ...(remindAtVal ? { remindAt: remindAtVal } : {}) },
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
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            tagIds: z.string().optional(),
            page: z.coerce.number().int().positive().default(1),
            pageSize: z.coerce.number().int().positive().max(100).default(20),
        });
        const q = querySchema.safeParse(req.query);
        if (!q.success)
            throw badRequest('Invalid query', q.error.flatten());
        let dateWhere = {};
        if (q.data.date) {
            const start = new Date(q.data.date);
            const end = new Date(q.data.date);
            end.setDate(end.getDate() + 1);
            dateWhere = { remindAt: { gte: start, lt: end } };
        }
        const tagIds = q.data.tagIds?.split(',').filter(Boolean);
        const where = {
            userId,
            ...dateWhere,
            ...(q.data.status ? { status: q.data.status } : {}),
            ...(q.data.q?.trim()
                ? { note: { contentPlain: { contains: q.data.q.trim(), mode: 'insensitive' } } }
                : {}),
            ...(tagIds?.length
                ? { note: { noteTags: { some: { tagId: { in: tagIds } } } } }
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
        const id = z.string().uuid().parse(req.params.id);
        const body = UpdateReminderSchema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid payload', body.error.flatten());
        const reminder = await prisma.reminder.findFirst({
            where: { id, userId },
        });
        if (!reminder)
            throw notFound('Reminder not found');
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
    /** 获取提醒事项的分标签计数 */
    app.get('/api/reminders/tag-counts', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        // 获取所有提醒事项及其关联笔记的标签
        const reminders = await prisma.reminder.findMany({
            where: { userId },
            select: {
                note: {
                    select: {
                        noteTags: {
                            select: { tagId: true }
                        }
                    }
                }
            }
        });
        const counts = {};
        for (const r of reminders) {
            if (r.note?.noteTags) {
                for (const nt of r.note.noteTags) {
                    counts[nt.tagId] = (counts[nt.tagId] || 0) + 1;
                }
            }
        }
        return sendData(reply, { counts });
    });
    /** 从提醒中移除 */
    app.delete('/api/reminders/:id', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const id = z.string().uuid().parse(req.params.id);
        const reminder = await prisma.reminder.findFirst({
            where: { id, userId },
        });
        if (!reminder)
            throw notFound('Reminder not found');
        await prisma.reminder.delete({ where: { id } });
        return sendData(reply, { ok: true });
    });
}
