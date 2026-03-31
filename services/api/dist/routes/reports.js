import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { sendData } from '../http/reply.js';
import { badRequest } from '../http/errors.js';
import { llmSummarizeNotes } from '../services/llmSummarize.js';
const SummarizeSchema = z.object({
    notes: z.array(z.object({
        content: z.string(),
        date: z.string(),
    })),
    rangeText: z.string(),
    categoryName: z.string(),
});
export async function registerReportRoutes(app) {
    /**
     * 对笔记进行总结与分析（使用 LLM）
     * 返回结构化的分析报告，而非逐条罗列
     */
    app.post('/api/reports/summarize', { preHandler: requireAuth }, async (req, reply) => {
        const body = SummarizeSchema.safeParse(req.body);
        if (!body.success)
            throw badRequest('Invalid summarization payload', body.error.flatten());
        const summary = await llmSummarizeNotes(body.data.notes, {
            rangeText: body.data.rangeText,
            categoryName: body.data.categoryName,
        });
        return sendData(reply, { summary });
    });
}
