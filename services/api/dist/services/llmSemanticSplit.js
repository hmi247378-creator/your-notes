import OpenAI from 'openai';
import { isLLMClassifyEnabled, getLLMConfig } from '../env.js';
/**
 * 使用 LLM 将一段无结构文字按语义拆分成多个片段
 * - 适用于用户输入了一段混合多主题的文字，无编号、无列表
 * - 返回拆解后的片段数组，每个片段对应一个可独立分类的主题
 * - 支持 OpenAI / DeepSeek 等兼容接口
 */
export async function llmSemanticSplit(text) {
    if (!isLLMClassifyEnabled() || !text || text.length < 30) {
        return [];
    }
    const { apiKey, baseURL, model } = getLLMConfig();
    const client = new OpenAI({ apiKey, baseURL });
    const sysPrompt = `你是一个笔记内容分析助手。用户输入了一段文字，可能包含多个不同主题/事项（如工作、学习、生活等）。
请按语义将文字拆分成多个独立片段，每个片段只包含一个主题。
规则：
1. 只拆分成 2-10 个片段，不要过度拆分
2. 每个片段应是完整、可独立理解的一句话或短段落
3. 若整段只讲一个主题，返回包含整段文字的单个元素数组
4. 返回 JSON 对象，格式：{"segments": ["片段1", "片段2", ...]}
5. 不要添加任何解释，只返回 JSON`;
    const userPrompt = `待分析文字：
${text.slice(0, 3000)}

请返回 JSON 对象，如 {"segments": ["...", "..."]}。`;
    try {
        const res = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 1500,
        });
        const content = res.choices[0]?.message?.content;
        if (!content)
            return [];
        const parsed = JSON.parse(content);
        const segments = parsed.segments ?? [];
        return segments
            .filter((s) => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim());
    }
    catch (err) {
        console.error('[llmSemanticSplit]', err?.message ?? err);
        return [];
    }
}
