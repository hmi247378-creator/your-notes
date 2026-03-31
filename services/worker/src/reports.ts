import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from './db.js';
import { sendData } from './utils.js';

const reports = new Hono<{ Bindings: Env; Variables: { jwtPayload: { userId: string } } }>();

const SummarizeSchema = z.object({
  notes: z.array(
    z.object({
      content: z.string(),
      date: z.string(),
    }),
  ),
  rangeText: z.string(),
  categoryName: z.string(),
});

reports.post('/summarize', async (c) => {
  const body = SummarizeSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid summarization payload' }, 400);

  const { notes, rangeText, categoryName } = body.data;
  if (notes.length === 0) return c.json(sendData({ summary: '暂无笔记内容可供总结。' }));

  const prompt = `
    你是一个智能笔记分析助手。以下是用户在 "${rangeText}" 期间关于 "${categoryName}" 标签下的笔记内容。
    请对这些内容进行精炼的总结与分析，重点提取核心事项、进展及潜在的模式。
    
    笔记内容如下：
    ${notes.map(n => `[${n.date}]: ${n.content}`).join('\n')}
    
    请直接返回总结内容。
  `;

  try {
    const aiResponse: any = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: '你是一个擅长总结和分析笔记内容的专业助手。' },
        { role: 'user', content: prompt }
      ]
    });

    const summary = aiResponse.response || aiResponse.choices?.[0]?.message?.content || '总结生成失败。';
    return c.json(sendData({ summary }));
  } catch (err: any) {
    console.error('AI Summarization Error:', err);
    return c.json({ error: 'AI Summarization failed' }, 500);
  }
});

export { reports };
