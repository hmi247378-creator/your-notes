import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';
import { buildTagPath } from '../utils/tagPath.js';
import { logChange } from '../services/changeLog.js';
import { buildKeywordsFromManual, normalizeManualKeywords } from '../services/tagProfile.js';
const CreateTagSchema = z.object({
    name: z.string().min(1).max(50),
    color: z.string().max(20).optional(),
    parentId: z.string().uuid().nullable().optional(),
    keywords: z.array(z.string()).optional(), // 手动关键词（冷启动更准）
});
const UpdateTagSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    color: z.string().max(20).optional(),
    parentId: z.string().uuid().nullable().optional(),
    keywords: z.array(z.string()).optional(),
});
function buildTree(tags) {
    const map = new Map();
    for (const t of tags)
        map.set(t.id, { ...t, children: [] });
    const roots = [];
    for (const node of map.values()) {
        if (!node.parentId)
            roots.push(node);
        else
            map.get(node.parentId)?.children.push(node);
    }
    return roots;
}
async function assertDepthOk(userId, parentId, movingTagId) {
    const parent = parentId
        ? await prisma.tag.findFirst({ where: { id: parentId, userId }, select: { depth: true, path: true } })
        : null;
    if (parentId && !parent)
        throw notFound('Parent tag not found');
    const baseDepth = (parent?.depth ?? 0) + 1;
    if (!movingTagId) {
        if (baseDepth > 7)
            throw badRequest('Tag depth exceeds limit (<=7)');
        return { parentPath: parent?.path ?? null, depth: baseDepth };
    }
    const current = await prisma.tag.findFirst({
        where: { id: movingTagId, userId },
        select: { depth: true, path: true },
    });
    if (!current)
        throw notFound('Tag not found');
    const parentPath = parent?.path ?? null;
    const movingPath = current.path;
    if (parentPath && (parentPath === movingPath || parentPath.startsWith(`${movingPath}.`))) {
        throw forbidden('Cannot move tag into its own subtree');
    }
    const subtreeMaxDepth = await prisma.tag.aggregate({
        where: {
            userId,
            OR: [{ path: movingPath }, { path: { startsWith: `${movingPath}.` } }],
        },
        _max: { depth: true },
    });
    const delta = baseDepth - current.depth;
    const maxDepthAfterMove = (subtreeMaxDepth._max.depth ?? current.depth) + delta;
    if (maxDepthAfterMove > 7)
        throw badRequest('Move would exceed tag depth limit (<=7)');
    return { parentPath: parent?.path ?? null, depth: baseDepth };
}
async function updateSubtreePaths(params) {
    await prisma.$transaction(async (tx) => {
        const subtree = await tx.tag.findMany({
            where: {
                userId: params.userId,
                OR: [{ path: params.oldPath }, { path: { startsWith: `${params.oldPath}.` } }],
            },
            select: { id: true, path: true, depth: true },
            orderBy: { depth: 'asc' },
        });
        for (const t of subtree) {
            const suffix = t.path === params.oldPath ? '' : t.path.slice(params.oldPath.length);
            const nextPath = `${params.newPath}${suffix}`;
            const nextDepth = t.depth + params.deltaDepth;
            if (t.id === params.tagId) {
                await tx.tag.update({
                    where: { id: t.id },
                    data: {
                        name: params.nextName,
                        color: params.nextColor,
                        parentId: params.nextParentId,
                        path: nextPath,
                        depth: params.nextDepth,
                    },
                });
            }
            else {
                await tx.tag.update({ where: { id: t.id }, data: { path: nextPath, depth: nextDepth } });
            }
        }
    });
}
export async function registerTagRoutes(app) {
    app.get('/api/tags/tree', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const tags = await prisma.tag.findMany({
            where: { userId },
            orderBy: { path: 'asc' },
            select: { id: true, name: true, color: true, parentId: true, path: true, depth: true, keywords: true },
        });
        return sendData(reply, { tags: buildTree(tags) });
    });
    app.post('/api/tags', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const body = CreateTagSchema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid tag payload', body.error.flatten());
        const parentId = body.data.parentId ?? null;
        const { parentPath, depth } = await assertDepthOk(userId, parentId);
        const path = buildTagPath(parentPath, body.data.name);
        const manual = body.data.keywords ? normalizeManualKeywords(body.data.keywords) : [];
        const keywords = manual.length ? buildKeywordsFromManual(manual) : undefined;
        const tag = await prisma.tag.create({
            data: { userId, name: body.data.name, color: body.data.color, parentId, path, depth, keywords: keywords },
            select: { id: true, path: true, depth: true },
        });
        await logChange({ userId, entityType: 'tag', entityId: tag.id, op: 'upsert', payload: tag });
        return sendData(reply, tag);
    });
    app.patch('/api/tags/:id', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const tagId = z.string().uuid().parse(req.params.id);
        const body = UpdateTagSchema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid tag payload', body.error.flatten());
        const existing = await prisma.tag.findFirst({ where: { id: tagId, userId } });
        if (!existing)
            throw notFound('Tag not found');
        const nextParentId = body.data.parentId === undefined ? existing.parentId : body.data.parentId;
        const nextName = body.data.name ?? existing.name;
        const { parentPath, depth } = await assertDepthOk(userId, nextParentId ?? null, tagId);
        const nextPath = buildTagPath(parentPath, nextName);
        const nextColor = body.data.color ?? existing.color;
        const deltaDepth = depth - existing.depth;
        if (body.data.keywords) {
            const manual = normalizeManualKeywords(body.data.keywords);
            const nextKeywords = buildKeywordsFromManual(manual);
            await prisma.tag.update({ where: { id: tagId }, data: { keywords: nextKeywords } });
        }
        if (nextPath !== existing.path || deltaDepth !== 0 || (nextParentId ?? null) !== existing.parentId) {
            await updateSubtreePaths({
                userId,
                tagId,
                oldPath: existing.path,
                newPath: nextPath,
                deltaDepth,
                nextName,
                nextColor,
                nextParentId: nextParentId ?? null,
                nextDepth: depth,
            });
        }
        else if (nextColor !== existing.color || nextName !== existing.name) {
            await prisma.tag.update({ where: { id: tagId }, data: { name: nextName, color: nextColor } });
        }
        const updated = { id: tagId, path: nextPath, depth };
        await logChange({ userId, entityType: 'tag', entityId: tagId, op: 'upsert', payload: updated });
        return sendData(reply, updated);
    });
    app.post('/api/tags/merge', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const schema = z.object({
            sourceTagIds: z.array(z.string().uuid()).min(1),
            targetTagId: z.string().uuid(),
            deleteSources: z.boolean().default(true),
        });
        const body = schema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid merge payload', body.error.flatten());
        const target = await prisma.tag.findFirst({ where: { id: body.data.targetTagId, userId } });
        if (!target)
            throw notFound('Target tag not found');
        const sources = await prisma.tag.findMany({
            where: { userId, id: { in: body.data.sourceTagIds }, NOT: { id: target.id } },
            select: { id: true },
        });
        const noteTags = await prisma.noteTag.findMany({
            where: { tagId: { in: sources.map((s) => s.id) } },
            select: { noteId: true, tagId: true },
        });
        const uniqueNoteIds = [...new Set(noteTags.map((nt) => nt.noteId))];
        for (const noteId of uniqueNoteIds) {
            await prisma.noteTag.upsert({
                where: { noteId_tagId: { noteId, tagId: target.id } },
                update: {},
                create: { noteId, tagId: target.id },
            });
        }
        const deleted = body.data.deleteSources
            ? await prisma.tag.deleteMany({ where: { userId, id: { in: sources.map((s) => s.id) } } })
            : { count: 0 };
        await logChange({ userId, entityType: 'tag', entityId: target.id, op: 'upsert', payload: { mergedFrom: sources.map((s) => s.id) } });
        return sendData(reply, { migratedNoteCount: uniqueNoteIds.length, deletedSourceCount: deleted.count });
    });
    app.delete('/api/tags/:id', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const tagId = z.string().uuid().parse(req.params.id);
        const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
        if (!tag)
            throw notFound('Tag not found');
        const childCount = await prisma.tag.count({ where: { userId, parentId: tagId } });
        if (childCount > 0)
            throw badRequest('Tag has children; delete blocked in Phase 1');
        const noteCount = await prisma.noteTag.count({ where: { tagId } });
        if (noteCount > 0)
            throw badRequest('Tag has notes; delete blocked in Phase 1');
        await prisma.tag.delete({ where: { id: tagId } });
        await logChange({ userId, entityType: 'tag', entityId: tagId, op: 'delete' });
        return sendData(reply, { deleted: true });
    });
}
