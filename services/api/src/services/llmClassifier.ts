import OpenAI from 'openai';
import { isLLMClassifyEnabled, getLLMConfig } from '../env.js';

export type TagOption = { id: string; path: string; keywords?: string[]; sampleSnippets?: string[] };

/**
 * 使用 LLM 做语义分类
 * - 输入：文本 + 可选标签列表（含用户配置的关键词、历史画像词、已有记录样本）
 * - 输出：最匹配的 tagId（若有），或 null
 * - 支持 OpenAI / DeepSeek 等兼容接口
 */
export async function llmClassify(
  text: string,
  tags: TagOption[]
): Promise<{ tagId: string | null; reason: string }> {
  if (!isLLMClassifyEnabled() || tags.length === 0) {
    return { tagId: null, reason: 'LLM 未启用或标签为空' };
  }

  const { apiKey, baseURL, model } = getLLMConfig();
  const client = new OpenAI({ apiKey, baseURL });

  // 标签以 "路径 > 标签名" 展示，附带关键词、常用词、以及该标签下已有记录的代表性摘要
  const tagList = tags
    .map((t) => {
      const pathStr = t.path.replace(/\./g, ' > ');
      const kw = (t.keywords ?? []).filter(Boolean);
      const kwStr = kw.length ? ` | 关键词/常用词: ${kw.join('、')}` : '';
      const samples = (t.sampleSnippets ?? []).filter(Boolean);
      const sampleStr = samples.length
        ? ` | 该标签下已有记录示例: ${samples.map((s) => `"${s}"`).join('；')}`
        : '';
      return `- ${pathStr}（ID: ${t.id}）${kwStr}${sampleStr}`;
    })
    .join('\n');

  const sysPrompt = `你是一个笔记分类助手。根据用户输入的文本内容，结合过往记录分析，从给定的标签列表中选出最匹配的一个标签。

核心任务：分析当前录入信息是否在过往记录中有相应适配，从而判断更好的归类。

规则：
1. 只返回列表中存在的标签 ID，不要编造
2. 若没有合适标签，返回 null
3. 必须选择最具体层级（叶子）的标签，列表中均为可归类的具体标签
4. 优先参考每个标签的「关键词/常用词」，这些是用户配置或历史归类习惯
5. 特别重要：参考「该标签下已有记录示例」，这些是用户过往实际归入该标签的内容。若待分类文本与某标签的示例在主题、用词、风格上相似，应归入该标签；即使用户已在其他记录中用过的词，也要根据上下文判断最匹配的标签
6. 考虑语义相似性（如"开会记录"可归入"会议"）
7. 当文本包含多个主题或「标题+具体事项」格式时（如"XX工作总结 某项目系统对账单"），选择与具体事项/主体内容最相关的标签。「对账单」「系统对账」等应归入有关键词"对账""系统"的标签，而非仅因前文出现某词就选该标签
8. 人生感悟/哲理/个人成长类内容（如野草、弯腰、挺直、感悟、心态、怂了、不怕、生活反思、处世哲学等）应归入「知识库」或类似知识/个人类标签，而非「运营系统」「对账」等工作/业务类标签
9. 安全生产相关：凡涉及「隐患」「隐患台账」「隐患报告」「隐患分析」「年度隐患」「安全工作」「安全事项」「联络单」「安全检查」「安全培训」「隐患排查」等内容的，应归入「工作-安全生产」或「安全生产」子标签，而非父级「工作」或其他泛化标签
10. 返回 JSON：{"tagId": "uuid或null", "reason": "简短理由"}`;

  const userPrompt = `可选标签（含关键词、常用词、该标签下已有记录示例，请综合判断）：
${tagList}

待分类文本：
${text.slice(0, 2000)}

请返回 JSON。`;

  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) return { tagId: null, reason: 'LLM 无返回' };

    const parsed = JSON.parse(content) as { tagId?: string | null; reason?: string };
    const tagId = parsed.tagId && tags.some((t) => t.id === parsed.tagId) ? parsed.tagId : null;
    const reason = String(parsed.reason ?? '').slice(0, 100);

    return { tagId, reason };
  } catch (err: any) {
    console.error('[llmClassify]', err?.message ?? err);
    return { tagId: null, reason: `LLM 调用失败: ${err?.message ?? 'unknown'}` };
  }
}
