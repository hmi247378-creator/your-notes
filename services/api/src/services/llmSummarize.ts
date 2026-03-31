import OpenAI from 'openai';
import { isLLMClassifyEnabled, getLLMConfig } from '../env.js';

/** 单条笔记输入 */
export type NoteInput = {
  content: string;
  date: string; // YYYY-MM-DD
};

/**
 * 使用 DeepSeek/LLM 基于期间内的记录数据，生成该期间的「主要工作」总结
 * 仅输出一项主要工作内容，由大模型对记录文字进行归纳提炼
 */
export async function llmSummarizeNotes(
  notes: NoteInput[],
  options: { rangeText: string; categoryName: string },
): Promise<string> {
  if (!isLLMClassifyEnabled()) {
    return buildFallbackSummary(notes, options);
  }

  if (notes.length === 0) {
    return `# 期间工作总结\n\n**时间范围**：${options.rangeText}\n**统计范围**：${options.categoryName}\n\n## 主要工作\n\n该期间内暂无记录数据。`;
  }

  const { apiKey, baseURL, model } = getLLMConfig();
  const client = new OpenAI({ apiKey, baseURL });

  const notesText = notes
    .map((n) => (n.content || '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 100)
    .join('\n\n');

  const sysPrompt = `你是一个专业的职场写作助手。用户提供了一段时间内的多条工作/生活记录，请根据记录中的文字内容，调用你的理解与归纳能力，输出**仅一项**主要工作内容。

要求：
1. 必须基于记录中的实际文字内容进行归纳提炼
2. 只输出一段话，概括本期间最主要的工作内容（50-150 字）
3. 不要显示日期，不要分条列举，不要输出其他章节
4. 语言简洁专业，直接给出归纳结论
5. 只输出这段归纳文字，不要有任何前缀、标题或解释`;

  const userPrompt = `时间范围：${options.rangeText}
统计范围：${options.categoryName}
共 ${notes.length} 条记录。

原始记录内容：
${notesText.slice(0, 8000)}

请根据以上记录，归纳输出本期间的**一项主要工作**（仅一段话）。`;

  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 500,
    });

    const content = res.choices[0]?.message?.content?.trim();
    if (!content) return buildFallbackSummary(notes, options);

    return `# 期间工作总结\n\n**时间范围**：${options.rangeText}\n**统计范围**：${options.categoryName}\n**共 ${notes.length} 条记录**\n\n---\n\n## 主要工作\n\n${content}`;
  } catch (err: any) {
    console.error('[llmSummarizeNotes]', err?.message ?? err);
    return buildFallbackSummary(notes, options);
  }
}

/** LLM 未启用或调用失败时的兜底：仅显示主要工作，需配置 DeepSeek 调用大模型归纳 */
function buildFallbackSummary(notes: NoteInput[], options: { rangeText: string; categoryName: string }): string {
  let s = `# 期间工作总结\n\n**时间范围**：${options.rangeText}\n**统计范围**：${options.categoryName}\n**共 ${notes.length} 条记录**\n\n---\n\n## 主要工作\n\n`;

  if (notes.length === 0) {
    s += '该期间内暂无记录。\n';
    return s;
  }

  // 无 LLM 时无法智能归纳，取第一条记录作为简要展示
  const firstContent = notes.map((n) => (n.content || '').trim()).filter(Boolean)[0] || '';
  s += firstContent || '（暂无内容）\n\n';
  s += '\n> 提示：请在 .env 中配置 OPENAI_API_KEY、OPENAI_BASE_URL（DeepSeek）、LLM_MODEL，系统将调用大模型对记录内容进行智能归纳。\n';
  return s;
}
