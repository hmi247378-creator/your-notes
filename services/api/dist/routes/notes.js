import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest, notFound } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';
import { toPlainText } from '../utils/text.js';
import { logChange } from '../services/changeLog.js';
import { strengthenTagsFromText } from '../services/tagProfile.js';
import { classifyForUser } from '../services/classifier.js';
import { splitIngestText } from '../utils/ingest.js';
import { llmSemanticSplit } from '../services/llmSemanticSplit.js';
const CreateNoteSchema = z.object({
    contentMarkdown: z.string().min(1),
    tagIds: z.array(z.string().uuid()).default([]),
    source: z.string().min(1).default('pc'),
    recordedAt: z.string().min(1).optional(),
});
const UpdateNoteSchema = z.object({
    contentMarkdown: z.string().min(1).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    archived: z.boolean().optional(),
    recordedAt: z.string().min(1).optional(),
});
export async function registerNoteRoutes(app) {
    app.post('/api/notes', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const body = CreateNoteSchema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid note payload', body.error.flatten());
        const contentPlain = toPlainText(body.data.contentMarkdown);
        const note = await prisma.note.create({
            data: {
                userId,
                contentMd: body.data.contentMarkdown,
                contentPlain,
                source: body.data.source,
                recordedAt: body.data.recordedAt ? new Date(body.data.recordedAt) : undefined,
                noteTags: { create: body.data.tagIds.map((tagId) => ({ tagId })) },
            },
            select: { id: true, createdAt: true },
        });
        await logChange({ userId, entityType: 'note', entityId: note.id, op: 'upsert', payload: note });
        // Phase1：用新内容“喂”一下标签画像，提升后续 classify 命中率
        await strengthenTagsFromText({ userId, tagIds: body.data.tagIds, text: contentPlain });
        return sendData(reply, note);
    });
    /**
     * 智能录入预览：不保存，仅拆分和分类，返回每项内容及适配标签供用户确认
     */
    app.post('/api/notes/ingest/preview', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const schema = z.object({
            text: z.string().min(1),
            singleItem: z.boolean().optional().default(false),
            smartSplit: z.boolean().optional().default(false),
            preferredTagId: z.string().uuid().optional(),
        });
        const body = schema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid ingest preview payload', body.error.flatten());
        const rawText = body.data.text.trim();
        const { preferredTagId, singleItem, smartSplit } = body.data;
        let items;
        if (singleItem) {
            items = [rawText];
        }
        else if (smartSplit) {
            const byFormat = splitIngestText(rawText);
            if (byFormat.length > 1) {
                items = byFormat;
            }
            else {
                const single = byFormat[0];
                if (single && single.length >= 30) {
                    const llmParts = await llmSemanticSplit(single);
                    items = llmParts.length > 1 ? llmParts : byFormat;
                }
                else {
                    items = byFormat;
                }
            }
        }
        else {
            items = splitIngestText(rawText);
        }
        if (items.length === 0)
            throw badRequest('Empty text');
        const previewItems = [];
        for (const item of items) {
            const contentPlain = toPlainText(item);
            let tagIds;
            let suggestions;
            if (preferredTagId) {
                tagIds = [preferredTagId];
                suggestions = [];
            }
            else {
                const { suggestions: s } = await classifyForUser(userId, contentPlain);
                suggestions = s.map((x) => ({ tagId: x.tagId, score: x.score, level: x.level }));
                const topTagId = s[0]?.tagId ?? null;
                tagIds = topTagId ? [topTagId] : [];
            }
            previewItems.push({ text: item, tagIds, suggestions });
        }
        return sendData(reply, { items: previewItems });
    });
    /**
     * 智能录入确认：按用户选择的标签保存记录
     * 多条记录时创建 IngestBatch，用于「所有笔记」视图展示原始录入
     */
    app.post('/api/notes/ingest/confirm', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const schema = z.object({
            items: z.array(z.object({
                text: z.string().min(1),
                tagIds: z.array(z.string().uuid()),
            })).min(1).max(100),
            source: z.string().min(1).default('pc'),
            recordedAt: z.string().optional(),
        });
        const body = schema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid ingest confirm payload', body.error.flatten());
        const created = [];
        const rawText = body.data.items.map((i) => i.text).join('\n');
        const isBatch = body.data.items.length > 1;
        const batch = isBatch
            ? await prisma.ingestBatch.create({
                data: {
                    userId,
                    rawText,
                    recordedAt: body.data.recordedAt ? new Date(body.data.recordedAt) : undefined,
                },
                select: { id: true },
            })
            : null;
        for (const item of body.data.items) {
            const contentPlain = toPlainText(item.text);
            const tagIds = item.tagIds.length > 0 ? item.tagIds : [];
            const note = await prisma.note.create({
                data: {
                    userId,
                    contentMd: item.text,
                    contentPlain,
                    source: body.data.source,
                    recordedAt: body.data.recordedAt ? new Date(body.data.recordedAt) : undefined,
                    batchId: batch?.id ?? null,
                    noteTags: { create: tagIds.map((tagId) => ({ tagId })) },
                },
                select: { id: true },
            });
            await logChange({ userId, entityType: 'note', entityId: note.id, op: 'upsert', payload: { id: note.id } });
            if (tagIds.length)
                await strengthenTagsFromText({ userId, tagIds, text: contentPlain });
            created.push({ id: note.id, text: item.text, tagIds });
        }
        return sendData(reply, { createdCount: created.length, items: created });
    });
    /**
     * 智能录入：一段文字可能包含多条事项（如 1、2、3、4）。
     * - 自动拆分为多条记录
     * - 每条记录调用 classify 选择 top1 标签（若存在）
     * - 按标签保存，这样左侧点标签即可看到对应记录
     *
     * 模式说明：
     * - splitAndDistribute（默认）：智能分段，每条内容归类到对应标签下，分别创建记录
     * - singleItem：整段作为一条记录
     * - smartSplit：无格式时用 LLM 语义拆分长段落
     */
    app.post('/api/notes/ingest', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const schema = z.object({
            text: z.string().min(1),
            source: z.string().min(1).default('pc'),
            singleItem: z.boolean().optional().default(false),
            /** 无明显格式时，用 LLM 语义拆分长段落；有编号/列表时仍按格式拆分 */
            smartSplit: z.boolean().optional().default(false),
            preferredTagId: z.string().uuid().optional(),
            recordedAt: z.string().optional(),
        });
        const body = schema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid ingest payload', body.error.flatten());
        const rawText = body.data.text.trim();
        const { preferredTagId, singleItem, smartSplit, recordedAt } = body.data;
        let items;
        if (singleItem) {
            items = [rawText];
        }
        else if (smartSplit) {
            const byFormat = splitIngestText(rawText);
            if (byFormat.length > 1) {
                items = byFormat;
            }
            else {
                const single = byFormat[0];
                if (single && single.length >= 30) {
                    const llmParts = await llmSemanticSplit(single);
                    items = llmParts.length > 1 ? llmParts : byFormat;
                }
                else {
                    items = byFormat;
                }
            }
        }
        else {
            items = splitIngestText(rawText);
        }
        if (items.length === 0)
            throw badRequest('Empty text');
        const created = [];
        const isBatch = items.length > 1;
        const batch = isBatch
            ? await prisma.ingestBatch.create({
                data: {
                    userId,
                    rawText,
                    recordedAt: recordedAt ? new Date(recordedAt) : undefined,
                },
                select: { id: true },
            })
            : null;
        for (const item of items) {
            const contentPlain = toPlainText(item);
            let tagIds;
            let suggestionsForLog;
            if (preferredTagId) {
                tagIds = [preferredTagId];
                suggestionsForLog = [];
            }
            else {
                const { suggestions } = await classifyForUser(userId, contentPlain);
                suggestionsForLog = suggestions;
                const topTagId = suggestions[0]?.tagId ?? null;
                tagIds = topTagId ? [topTagId] : [];
            }
            const note = await prisma.note.create({
                data: {
                    userId,
                    contentMd: item,
                    contentPlain,
                    source: body.data.source,
                    recordedAt: recordedAt ? new Date(recordedAt) : undefined,
                    batchId: batch?.id ?? null,
                    noteTags: { create: tagIds.map((tagId) => ({ tagId })) },
                },
                select: { id: true },
            });
            await prisma.classificationSuggestion.create({
                data: {
                    userId,
                    noteId: note.id,
                    inputText: item,
                    suggestedTags: suggestionsForLog,
                    chosenTags: tagIds.length ? tagIds : undefined,
                },
            });
            await logChange({ userId, entityType: 'note', entityId: note.id, op: 'upsert', payload: { id: note.id } });
            await strengthenTagsFromText({ userId, tagIds, text: contentPlain });
            created.push({ id: note.id, text: item, tagIds });
        }
        return sendData(reply, { createdCount: created.length, items: created });
    });
    /**
     * 按当前筛选条件返回各标签下的记录数（用于左侧标签统计，与记录列表的筛选保持一致）
     */
    app.get('/api/notes/tag-counts', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const querySchema = z.object({
            q: z.string().optional(),
            from: z.string().optional(),
            to: z.string().optional(),
            dateField: z.enum(['createdAt', 'recordedAt']).optional().default('createdAt'),
        });
        const q = querySchema.safeParse(req.query);
        if (!q.success)
            throw badRequest('Invalid query', q.error.flatten());
        const dateField = q.data.dateField ?? 'createdAt';
        const noteWhere = {
            userId,
            deletedAt: null,
            ...(q.data.q?.trim()
                ? { contentPlain: { contains: q.data.q.trim(), mode: 'insensitive' } }
                : {}),
            ...(q.data.from || q.data.to
                ? dateField === 'recordedAt'
                    ? {
                        recordedAt: {
                            ...(q.data.from ? { gte: new Date(q.data.from) } : {}),
                            ...(q.data.to ? { lte: new Date(q.data.to) } : {}),
                        },
                    }
                    : {
                        createdAt: {
                            ...(q.data.from ? { gte: new Date(q.data.from) } : {}),
                            ...(q.data.to ? { lte: new Date(q.data.to) } : {}),
                        },
                    }
                : {}),
        };
        const rows = await prisma.noteTag.groupBy({
            by: ['tagId'],
            where: { note: noteWhere },
            _count: { tagId: true },
        });
        const counts = {};
        for (const r of rows)
            counts[r.tagId] = r._count.tagId;
        return sendData(reply, { counts });
    });
    app.get('/api/notes', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const querySchema = z.object({
            q: z.string().optional(),
            tagIds: z.string().optional(),
            from: z.string().optional(),
            to: z.string().optional(),
            /** 时间筛选字段：createdAt=创建时间，recordedAt=记录日期 */
            dateField: z.enum(['createdAt', 'recordedAt']).optional().default('createdAt'),
            /** 排序字段：createdAt=创建时间，recordedAt=记录日期 */
            sortBy: z.enum(['createdAt', 'recordedAt']).optional().default('createdAt'),
            /** 排序方向 */
            sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
            archived: z.string().optional(),
            page: z.coerce.number().int().positive().default(1),
            pageSize: z.coerce.number().int().positive().max(100).default(20),
        });
        const q = querySchema.safeParse(req.query);
        if (!q.success)
            throw badRequest('Invalid query', q.error.flatten());
        const tagIds = q.data.tagIds ? q.data.tagIds.split(',').filter(Boolean) : [];
        const archived = q.data.archived ? q.data.archived === 'true' : undefined;
        const dateField = q.data.dateField ?? 'createdAt';
        const sortBy = q.data.sortBy ?? 'createdAt';
        const sortOrder = q.data.sortOrder ?? 'desc';
        const searchQ = q.data.q?.trim();
        const dateFilter = q.data.from || q.data.to
            ? dateField === 'recordedAt'
                ? {
                    recordedAt: {
                        ...(q.data.from ? { gte: new Date(q.data.from) } : {}),
                        ...(q.data.to ? { lte: new Date(q.data.to) } : {}),
                    },
                }
                : {
                    createdAt: {
                        ...(q.data.from ? { gte: new Date(q.data.from) } : {}),
                        ...(q.data.to ? { lte: new Date(q.data.to) } : {}),
                    },
                }
            : {};
        if (tagIds.length > 0) {
            // 选中标签时：显示该标签下的分条记录（当前逻辑）
            const where = {
                userId,
                deletedAt: null,
                ...(archived === undefined ? {} : { archived }),
                ...(searchQ ? { contentPlain: { contains: searchQ, mode: 'insensitive' } } : {}),
                ...dateFilter,
                noteTags: { some: { tagId: { in: tagIds } } },
            };
            const orderBy = sortBy === 'recordedAt'
                ? { recordedAt: sortOrder }
                : { createdAt: sortOrder };
            const [total, items] = await Promise.all([
                prisma.note.count({ where }),
                prisma.note.findMany({
                    where,
                    orderBy,
                    skip: (q.data.page - 1) * q.data.pageSize,
                    take: q.data.pageSize,
                    select: {
                        id: true,
                        contentPlain: true,
                        archived: true,
                        createdAt: true,
                        updatedAt: true,
                        recordedAt: true,
                        noteTags: { select: { tagId: true } },
                    },
                }),
            ]);
            const mapped = items.map((n) => ({
                id: n.id,
                contentPreview: n.contentPlain,
                tagIds: n.noteTags.map((t) => t.tagId),
                createdAt: n.createdAt,
                updatedAt: n.updatedAt,
                recordedAt: n.recordedAt,
                archived: n.archived,
            }));
            return sendData(reply, { items: mapped, page: q.data.page, pageSize: q.data.pageSize, total });
        }
        // 未选标签（所有笔记）：显示原始记录 = 批次 + 独立单条
        const batchWhere = {
            userId,
            ...(searchQ ? { rawText: { contains: searchQ } } : {}),
            ...dateFilter,
        };
        const singleNoteWhere = {
            userId,
            deletedAt: null,
            batchId: null,
            ...(archived === undefined ? {} : { archived }),
            ...(searchQ ? { contentPlain: { contains: searchQ, mode: 'insensitive' } } : {}),
            ...dateFilter,
        };
        const [batches, singleNotes] = await Promise.all([
            prisma.ingestBatch.findMany({
                where: batchWhere,
                select: {
                    id: true,
                    rawText: true,
                    recordedAt: true,
                    createdAt: true,
                    notes: { select: { noteTags: { select: { tagId: true } } } },
                },
                orderBy: sortBy === 'recordedAt' ? { recordedAt: sortOrder } : { createdAt: sortOrder },
            }),
            prisma.note.findMany({
                where: singleNoteWhere,
                select: {
                    id: true,
                    contentPlain: true,
                    archived: true,
                    createdAt: true,
                    updatedAt: true,
                    recordedAt: true,
                    noteTags: { select: { tagId: true } },
                },
                orderBy: sortBy === 'recordedAt' ? { recordedAt: sortOrder } : { createdAt: sortOrder },
            }),
        ]);
        const batchRows = batches.map((b) => {
            const tagSet = new Set();
            for (const n of b.notes)
                for (const t of n.noteTags)
                    tagSet.add(t.tagId);
            return {
                id: `batch:${b.id}`,
                contentPreview: b.rawText,
                tagIds: Array.from(tagSet),
                createdAt: b.createdAt,
                updatedAt: b.createdAt,
                recordedAt: b.recordedAt,
                archived: false,
                _sortKey: (b.recordedAt ?? b.createdAt),
            };
        });
        // 无批次的历史记录：按记录日期分组，同一天的多条合并为一条显示（模拟原始录入）
        const singleNoteRows = [];
        const byDate = new Map();
        for (const n of singleNotes) {
            const d = n.recordedAt ?? n.createdAt;
            const dateStr = d.toISOString().slice(0, 10);
            const list = byDate.get(dateStr) ?? [];
            list.push(n);
            byDate.set(dateStr, list);
        }
        for (const [dateStr, notes] of byDate) {
            const first = notes[0];
            const sortKey = (first.recordedAt ?? first.createdAt);
            if (notes.length === 1) {
                singleNoteRows.push({
                    id: first.id,
                    contentPreview: first.contentPlain,
                    tagIds: first.noteTags.map((t) => t.tagId),
                    createdAt: first.createdAt,
                    updatedAt: first.updatedAt,
                    recordedAt: first.recordedAt,
                    archived: first.archived,
                    _sortKey: sortKey,
                });
            }
            else {
                const tagSet = new Set();
                for (const n of notes)
                    for (const t of n.noteTags)
                        tagSet.add(t.tagId);
                singleNoteRows.push({
                    id: `date:${dateStr}`,
                    contentPreview: notes.map((n) => n.contentPlain).join('\n\n'),
                    tagIds: Array.from(tagSet),
                    createdAt: first.createdAt,
                    updatedAt: notes.reduce((latest, n) => (n.updatedAt > latest ? n.updatedAt : latest), first.updatedAt),
                    recordedAt: first.recordedAt,
                    archived: false,
                    _sortKey: sortKey,
                });
            }
        }
        const merged = [...batchRows, ...singleNoteRows].sort((a, b) => {
            const cmp = a._sortKey.getTime() - b._sortKey.getTime();
            return sortOrder === 'desc' ? -cmp : cmp;
        });
        const total = merged.length;
        const skip = (q.data.page - 1) * q.data.pageSize;
        const pageItems = merged.slice(skip, skip + q.data.pageSize);
        const mapped = pageItems.map((r) => ({
            id: r.id,
            contentPreview: r.contentPreview,
            tagIds: r.tagIds,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            recordedAt: r.recordedAt,
            archived: r.archived,
        }));
        return sendData(reply, { items: mapped, page: q.data.page, pageSize: q.data.pageSize, total });
    });
    app.get('/api/notes/:id', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const noteId = z.string().uuid().parse(req.params.id);
        const note = await prisma.note.findFirst({
            where: { id: noteId, userId, deletedAt: null },
            select: { id: true, contentMd: true, createdAt: true, updatedAt: true, recordedAt: true, archived: true, noteTags: { select: { tagId: true } } },
        });
        if (!note)
            throw notFound('Note not found');
        return sendData(reply, {
            id: note.id,
            contentMarkdown: note.contentMd,
            tagIds: note.noteTags.map((t) => t.tagId),
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            recordedAt: note.recordedAt,
            archived: note.archived,
        });
    });
    app.patch('/api/notes/:id', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const noteId = z.string().uuid().parse(req.params.id);
        const body = UpdateNoteSchema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid note payload', body.error.flatten());
        const existing = await prisma.note.findFirst({ where: { id: noteId, userId, deletedAt: null } });
        if (!existing)
            throw notFound('Note not found');
        const contentMd = body.data.contentMarkdown ?? existing.contentMd;
        const contentPlain = body.data.contentMarkdown ? toPlainText(body.data.contentMarkdown) : existing.contentPlain;
        const recordedAt = body.data.recordedAt ? new Date(body.data.recordedAt) : undefined;
        await prisma.note.update({
            where: { id: noteId },
            data: {
                contentMd,
                contentPlain,
                archived: body.data.archived ?? existing.archived,
                ...(recordedAt !== undefined && { recordedAt }),
            },
        });
        if (body.data.tagIds) {
            await prisma.noteTag.deleteMany({ where: { noteId } });
            await prisma.noteTag.createMany({ data: body.data.tagIds.map((tagId) => ({ noteId, tagId })) });
            await strengthenTagsFromText({ userId, tagIds: body.data.tagIds, text: contentPlain });
        }
        await logChange({ userId, entityType: 'note', entityId: noteId, op: 'upsert', payload: { id: noteId } });
        return sendData(reply, { updated: true });
    });
    app.delete('/api/notes/:id', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const noteId = z.string().uuid().parse(req.params.id);
        const existing = await prisma.note.findFirst({ where: { id: noteId, userId, deletedAt: null }, select: { id: true } });
        if (!existing)
            throw notFound('Note not found');
        await prisma.note.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
        await logChange({ userId, entityType: 'note', entityId: noteId, op: 'delete' });
        return sendData(reply, { deleted: true });
    });
    /** 删除某日无批次的所有记录（用于历史数据按日期分组展示时的合并删除） */
    app.delete('/api/notes/by-date/:dateStr', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const dateStr = req.params.dateStr;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
            throw badRequest('Invalid date format, use YYYY-MM-DD', null);
        const from = new Date(dateStr + 'T00:00:00');
        const to = new Date(dateStr + 'T23:59:59.999');
        const where = {
            userId,
            deletedAt: null,
            batchId: null,
            OR: [
                { recordedAt: { gte: from, lte: to } },
                { recordedAt: null, createdAt: { gte: from, lte: to } },
            ],
        };
        const notes = await prisma.note.findMany({ where, select: { id: true } });
        await prisma.note.updateMany({ where, data: { deletedAt: new Date() } });
        for (const n of notes)
            await logChange({ userId, entityType: 'note', entityId: n.id, op: 'delete' });
        return sendData(reply, { deleted: true, count: notes.length });
    });
    /** 删除智能录入批次（级联删除其下所有分条记录） */
    app.delete('/api/notes/batch/:batchId', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const batchId = z.string().uuid().parse(req.params.batchId);
        const batch = await prisma.ingestBatch.findFirst({ where: { id: batchId, userId }, select: { id: true } });
        if (!batch)
            throw notFound('Batch not found');
        await prisma.ingestBatch.delete({ where: { id: batchId } });
        await logChange({ userId, entityType: 'ingestBatch', entityId: batchId, op: 'delete' });
        return sendData(reply, { deleted: true });
    });
    /** 批量重分类：对未归类的记录（无标签）重新执行分类并打标签 */
    app.post('/api/notes/reclassify-untagged', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const untaggedNotes = await prisma.note.findMany({
            where: {
                userId,
                deletedAt: null,
                noteTags: { none: {} },
            },
            select: { id: true, contentPlain: true },
        });
        if (untaggedNotes.length === 0) {
            return sendData(reply, { reclassifiedCount: 0, message: '暂无未归类的记录' });
        }
        let reclassifiedCount = 0;
        for (const note of untaggedNotes) {
            const { suggestions } = await classifyForUser(userId, note.contentPlain);
            const topTagId = suggestions[0]?.tagId ?? null;
            if (topTagId) {
                await prisma.noteTag.create({ data: { noteId: note.id, tagId: topTagId } });
                await strengthenTagsFromText({ userId, tagIds: [topTagId], text: note.contentPlain });
                reclassifiedCount += 1;
            }
        }
        return sendData(reply, { reclassifiedCount, total: untaggedNotes.length });
    });
    app.post('/api/notes/batch', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const schema = z.discriminatedUnion('op', [
            z.object({ noteIds: z.array(z.string().uuid()).min(1), op: z.literal('updateTags'), tagIds: z.array(z.string().uuid()) }),
            z.object({ noteIds: z.array(z.string().uuid()).min(1), op: z.literal('archive'), archived: z.boolean() }),
        ]);
        const body = schema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid batch payload', body.error.flatten());
        if (body.data.op === 'archive') {
            const r = await prisma.note.updateMany({ where: { userId, id: { in: body.data.noteIds } }, data: { archived: body.data.archived } });
            return sendData(reply, { affected: r.count });
        }
        for (const noteId of body.data.noteIds) {
            await prisma.noteTag.deleteMany({ where: { noteId } });
            await prisma.noteTag.createMany({ data: body.data.tagIds.map((tagId) => ({ noteId, tagId })) });
            await logChange({ userId, entityType: 'note', entityId: noteId, op: 'upsert', payload: { id: noteId } });
        }
        return sendData(reply, { affected: body.data.noteIds.length });
    });
}
