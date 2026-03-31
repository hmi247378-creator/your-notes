import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';
import { strengthenTagsFromText } from '../services/tagProfile.js';
export async function registerFeedbackRoutes(app) {
    app.post('/api/feedback', { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user.userId;
        const schema = z.object({
            noteId: z.string().uuid(),
            beforeTagIds: z.array(z.string().uuid()).optional(),
            afterTagIds: z.array(z.string().uuid()).min(1),
            reason: z.string().max(200).optional(),
            suggestionId: z.string().uuid().optional(),
        });
        const body = schema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid feedback payload', body.error.flatten());
        await prisma.classificationFeedback.create({
            data: {
                userId,
                noteId: body.data.noteId,
                beforeTags: body.data.beforeTagIds ? body.data.beforeTagIds : undefined,
                afterTags: body.data.afterTagIds,
                reason: body.data.reason,
            },
        });
        // Phase1：把用户最终选择的标签，当作“正确标签”，用笔记内容强化标签画像
        const note = await prisma.note.findFirst({
            where: { id: body.data.noteId, userId, deletedAt: null },
            select: { contentPlain: true },
        });
        if (note) {
            await strengthenTagsFromText({ userId, tagIds: body.data.afterTagIds, text: note.contentPlain });
        }
        if (body.data.suggestionId) {
            await prisma.classificationSuggestion.updateMany({
                where: { id: body.data.suggestionId, userId },
                data: { noteId: body.data.noteId, chosenTags: body.data.afterTagIds },
            });
        }
        return sendData(reply, { saved: true });
    });
}
