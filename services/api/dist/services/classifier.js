import { prisma } from '../prisma.js';
import { simpleTokens } from '../utils/text.js';
import { llmClassify } from './llmClassifier.js';
import { getTagRecordProfiles } from './tagRecordProfile.js';
/** 规则置信度阈值：低于此值时尝试 LLM 兜底 */
const RULE_CONFIDENCE_THRESHOLD = 0.65;
/** 内置语义扩展：标签名不在文本时，用相关词提升匹配（如「安全检查」→「安全生产」） */
const TAG_SEMANTIC_EXPANSIONS = {
    安全生产: [
        '安全检查', '检查计划', '培训计划', '安全培训', '隐患排查', '整改', '审批',
        // 隐患报告、隐患台账等场景的强匹配（2-gram 可命中）
        '隐患', '隐患台账', '隐患报告', '台账', '报告', '分析',
        // 安全工作、安全事项等常见表述
        '安全工作', '安全事项', '联络单',
    ],
    运营系统: ['对账', '系统', '对账单', '系统对账'],
};
function levelFrom(scores, idx) {
    const top = scores[0] ?? 0;
    const current = scores[idx] ?? 0;
    if (top <= 0.0001)
        return 'low';
    if (idx === 0 && current >= 0.75)
        return 'high';
    if (current / top >= 0.65)
        return 'mid';
    return 'low';
}
/**
 * 规则分类：综合标签名、用户配置关键词、历史画像、已有记录内容
 * - 标签名：完整出现权重最高
 * - 手动关键词：用户编辑时配置，强信号
 * - counts：历史归类学习词，反映用户习惯
 * - recordProfile：该标签下已有记录中的词汇，反映用户实际使用习惯
 */
/** 扩展输入 token：2-gram + 3/4 字短语，确保「安全工作」「安全事项」「联络单」等能命中 */
function buildInputTokenCounts(text) {
    const fromSimple = simpleTokens(text).map((t) => t.trim()).filter(Boolean);
    const normalized = text.toLowerCase();
    const hanParts = normalized.match(/[\p{Script=Han}]+/gu) ?? [];
    const longer = [];
    for (const p of hanParts) {
        if (p.length < 3)
            continue;
        for (let i = 0; i <= p.length - 3; i += 1) {
            longer.push(p.slice(i, i + 3));
            if (i <= p.length - 4)
                longer.push(p.slice(i, i + 4));
        }
    }
    const inputCounts = {};
    for (const t of [...fromSimple, ...longer]) {
        if (t.length >= 2)
            inputCounts[t] = (inputCounts[t] ?? 0) + 1;
    }
    return inputCounts;
}
function ruleBasedClassify(tags, text, recordProfiles) {
    const inputCounts = buildInputTokenCounts(text);
    const textLower = text.toLowerCase();
    const scored = tags
        .map((t) => {
        const weights = {};
        // 标签名在文本中完整出现时给最高权重（如「安全生产」「运营系统」）
        const tagNameLower = t.name.toLowerCase();
        const tagNameInText = tagNameLower && textLower.includes(tagNameLower);
        if (tagNameInText) {
            weights[tagNameLower] = 10;
        }
        for (const tok of simpleTokens(t.name)) {
            const key = tok.trim();
            if (!key)
                continue;
            weights[key] = Math.max(weights[key] ?? 0, 3);
        }
        const manual = Array.isArray(t.keywords?.manual) ? (t.keywords.manual ?? []) : [];
        // 用户配置的关键词权重高，确保智能归类时优先匹配
        for (const k of manual)
            weights[k.toLowerCase()] = Math.max(weights[k.toLowerCase()] ?? 0, 5);
        // 内置语义扩展：标签名不在文本时，用相关词提升匹配（如「安全检查」→「安全生产」）
        const semanticExpansions = TAG_SEMANTIC_EXPANSIONS[t.name] ?? [];
        for (const k of semanticExpansions) {
            weights[k.toLowerCase()] = Math.max(weights[k.toLowerCase()] ?? 0, 5);
        }
        const counts = t.keywords?.counts && typeof t.keywords.counts === 'object'
            ? t.keywords.counts
            : {};
        const countKeys = new Set(Object.keys(counts).map((k) => k.toLowerCase()));
        const manualSet = new Set(manual.map((k) => k.toLowerCase()));
        for (const [k, v] of Object.entries(counts)) {
            if (!k)
                continue;
            weights[k.toLowerCase()] = (weights[k.toLowerCase()] ?? 0) + Math.min(5, v);
        }
        // 已有记录内容词汇：该标签下用户实际写过的词，强信号（避免用户用过的词还被误适配）
        const profile = recordProfiles.get(t.id);
        if (profile?.recordTokens) {
            for (const [k, v] of Object.entries(profile.recordTokens)) {
                if (!k)
                    continue;
                const key = k.toLowerCase();
                // 权重 4：记录内容词比 counts 略高（直接来自用户记录），与 manual 接近
                weights[key] = (weights[key] ?? 0) + Math.min(4, v);
            }
        }
        const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
        let hitWeight = 0;
        const hits = [];
        // 标签名完整出现时直接计入（避免 simpleTokens 只产 2-gram 导致漏掉 4 字标签名）
        if (tagNameInText && weights[tagNameLower]) {
            hitWeight += weights[tagNameLower];
            hits.push({ tok: tagNameLower, w: weights[tagNameLower] });
        }
        const recordKeys = profile?.recordTokens
            ? new Set(Object.keys(profile.recordTokens).map((k) => k.toLowerCase()))
            : new Set();
        for (const [tok, w] of Object.entries(weights)) {
            if (tok === tagNameLower && tagNameInText)
                continue; // 已处理
            if (inputCounts[tok]) {
                // 当标签名不在输入文本中时，大幅降低「仅来自 counts」的权重，避免误归入
                // 若词来自已有记录内容（recordTokens）或手动关键词，保持完整权重
                const fromCountsOnly = countKeys.has(tok) && !manualSet.has(tok) && !recordKeys.has(tok);
                const multiplier = !tagNameInText && fromCountsOnly ? 0.2 : 1;
                hitWeight += w * Math.min(2, inputCounts[tok]) * multiplier;
                hits.push({ tok, w });
            }
        }
        hits.sort((a, b) => b.w - a.w);
        const reasons = hits.slice(0, 5).map((h) => `命中：${h.tok}（权重${h.w}）`);
        const score = Math.min(1, hitWeight / totalWeight);
        return { tagId: t.id, score, reasons, updatedAt: t.updatedAt, tagName: t.name };
    })
        .filter((x) => x.score > 0)
        .sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        // 同分时：优先选更具体的子标签（path 更长 = 更细分）
        const pathA = tags.find((t) => t.id === a.tagId)?.path ?? '';
        const pathB = tags.find((t) => t.id === b.tagId)?.path ?? '';
        const depthA = pathA.split('.').length;
        const depthB = pathB.split('.').length;
        if (depthA !== depthB)
            return depthB - depthA; // 优先更深层级
        // 同层时：优先选标签名在文本中更靠前的（更贴合该段主题）
        const idxA = textLower.indexOf(a.tagName?.toLowerCase() ?? '');
        const idxB = textLower.indexOf(b.tagName?.toLowerCase() ?? '');
        if (idxA >= 0 && idxB >= 0)
            return idxA - idxB;
        if (idxA >= 0)
            return -1;
        if (idxB >= 0)
            return 1;
        return 0;
    })
        .slice(0, 3)
        .map(({ tagName, ...rest }) => rest);
    if (scored.length === 0) {
        const fallback = [...tags]
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, 3)
            .map((t) => ({ tagId: t.id, score: 0.1, reasons: ['冷启动兜底：最近更新的标签'], updatedAt: t.updatedAt }));
        scored.push(...fallback);
    }
    return scored;
}
/**
 * 混合分类：规则优先 + LLM 语义兜底
 * - 规则置信度高（≥0.65）：直接用规则结果
 * - 规则置信度低：调用 LLM 做语义匹配，若命中则提升该标签为 top1
 */
/**
 * 获取叶子标签（无子标签的标签）：确认适配要求分类到最后一级，不归类到父级
 */
async function getLeafTags(userId) {
    const allTags = await prisma.tag.findMany({
        where: { userId },
        select: { id: true, name: true, path: true, keywords: true, updatedAt: true },
    });
    if (allTags.length === 0)
        return [];
    // 有子标签的 tagId 集合（父级标签）
    const parentIds = await prisma.tag
        .findMany({ where: { userId, parentId: { not: null } }, select: { parentId: true } })
        .then((rows) => new Set(rows.map((r) => r.parentId).filter(Boolean)));
    // 仅保留叶子标签（无子标签），若全为父级则用全部（兜底）
    const leafTags = allTags.filter((t) => !parentIds.has(t.id));
    return leafTags.length > 0 ? leafTags : allTags;
}
export async function classifyForUser(userId, text, options) {
    const tags = await getLeafTags(userId);
    if (tags.length === 0)
        return { suggestions: [], explain: [] };
    const recordProfiles = await getTagRecordProfiles(userId);
    let scored = ruleBasedClassify(tags, text, recordProfiles);
    // 当文本以「感悟：」「总结：」「心得：」等开头时，强制优选知识/个人类标签，避免误入运营系统等业务类
    const reflectionPrefix = /^(感悟|总结|心得|反思|随想|杂记|日记)[：:]\s*/;
    const businessTagNames = /运营|对账|系统|安全|生产|业务/i;
    const knowledgeTag = tags.find((t) => /知识|感悟|心得|个人|随笔/i.test(t.name));
    const topTagFromRule = scored[0] ? tags.find((t) => t.id === scored[0].tagId) : null;
    if (reflectionPrefix.test(text.trim()) &&
        knowledgeTag &&
        topTagFromRule &&
        businessTagNames.test(topTagFromRule.name) &&
        !topTagFromRule.name.includes('知识')) {
        // 用户明确用感悟类前缀，但规则推荐了业务类标签 → 用知识库替换 top1
        scored = [
            { tagId: knowledgeTag.id, score: 0.9, reasons: ['用户以「感悟/总结/心得」等前缀标明，归入知识类'], updatedAt: knowledgeTag.updatedAt },
            ...scored.filter((s) => s.tagId !== knowledgeTag.id),
        ].slice(0, 3);
    }
    // 安全生产强匹配：文本含安全相关词时，优先归入「工作-安全生产」等子标签（非父级「工作」）
    // 覆盖：隐患、安全工作、安全事项、联络单等用户常用表述
    const safetyKeywords = /隐患|隐患台账|隐患报告|隐患分析|年度隐患|安全工作|安全事项|联络单|安全检查|安全培训|隐患排查/;
    const safetyTag = tags.find((t) => t.name === '安全生产' || t.path.endsWith('.安全生产'));
    const top1FromRule = scored[0] ? tags.find((t) => t.id === scored[0].tagId) : null;
    if (safetyKeywords.test(text) && safetyTag && top1FromRule && top1FromRule.name !== '安全生产') {
        const safetyInScored = scored.find((s) => s.tagId === safetyTag.id);
        if (safetyInScored) {
            scored = [
                { ...safetyInScored, score: 0.9, reasons: ['文本含「隐患」等安全相关词，归入安全生产'] },
                ...scored.filter((s) => s.tagId !== safetyTag.id),
            ].slice(0, 3);
        }
        else {
            // 安全生产未在规则结果中，直接插入为 top1
            scored = [
                { tagId: safetyTag.id, score: 0.9, reasons: ['文本含「隐患」等安全相关词，归入安全生产'], updatedAt: safetyTag.updatedAt },
                ...scored.filter((s) => s.tagId !== safetyTag.id),
            ].slice(0, 3);
        }
    }
    const topScore = scored[0]?.score ?? 0;
    const secondScore = scored[1]?.score ?? 0;
    const topTag = scored[0] ? tags.find((t) => t.id === scored[0].tagId) : null;
    const topTagNameInText = topTag && text.toLowerCase().includes(topTag.name.toLowerCase());
    // 使用 LLM（DeepSeek）的场景：
    // 1. preferLLM（智能适配）：强制调用 LLM，结合过往记录分析当前录入的更好归类
    // 2. 规则置信度低（标签名不在文本或分数低）
    // 3. 多主题混合：文本含空格/分号/句号等分隔符，由 LLM 判断主分类
    // 4. 第二名得分较高（>=0.2）：top1 标签名在文本中，但第二名也有一定相关性
    const textHasMultipleParts = (text.trim().includes(' ') || /[。；;]/.test(text.trim())) && text.trim().length > 15;
    const effectiveThreshold = topTagNameInText ? RULE_CONFIDENCE_THRESHOLD : 0.75;
    const hasMultipleTopics = topTagNameInText &&
        (textHasMultipleParts || (secondScore >= 0.2 && scored.length >= 2));
    const shouldUseLLM = options?.preferLLM === true ||
        hasMultipleTopics ||
        (topScore < effectiveThreshold && !topTagNameInText);
    if (shouldUseLLM) {
        // 传入关键词 + 历史画像 top 词 + 该标签下已有记录样本，供 LLM 综合判断
        const tagOptions = tags.map((t) => {
            const manual = Array.isArray(t.keywords?.manual) ? (t.keywords.manual ?? []) : [];
            const counts = t.keywords?.counts && typeof t.keywords.counts === 'object'
                ? t.keywords.counts
                : {};
            const topCounts = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([k]) => k);
            const profile = recordProfiles.get(t.id);
            const recordTopTokens = profile?.recordTokens
                ? Object.entries(profile.recordTokens)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([k]) => k)
                : [];
            const semanticExpansions = TAG_SEMANTIC_EXPANSIONS[t.name] ?? [];
            const keywords = [...new Set([...manual, ...topCounts, ...recordTopTokens, ...semanticExpansions])].filter(Boolean).slice(0, 18);
            return {
                id: t.id,
                path: t.path,
                keywords,
                sampleSnippets: profile?.sampleSnippets ?? [],
            };
        });
        const { tagId: llmTagId, reason: llmReason } = await llmClassify(text, tagOptions);
        if (llmTagId) {
            // 将 LLM 选中的标签提到 top1
            const llmTag = scored.find((s) => s.tagId === llmTagId);
            if (llmTag) {
                scored = [
                    { ...llmTag, score: 0.85, reasons: [`LLM 语义匹配：${llmReason}`] },
                    ...scored.filter((s) => s.tagId !== llmTagId),
                ].slice(0, 3);
            }
            else {
                // LLM 返回了有效 tagId 但不在 scored 中，插入为 top1
                scored = [
                    { tagId: llmTagId, score: 0.85, reasons: [`LLM 语义匹配：${llmReason}`], updatedAt: new Date() },
                    ...scored,
                ].slice(0, 3);
            }
        }
    }
    const scores = scored.map((s) => s.score);
    const suggestions = scored.map((s, idx) => ({
        tagId: s.tagId,
        score: Number(s.score.toFixed(2)),
        level: levelFrom(scores, idx),
    }));
    const explain = scored
        .filter((s) => s.reasons.length)
        .map((s) => ({ tagId: s.tagId, reasons: s.reasons.slice(0, 5) }));
    return { suggestions, explain };
}
