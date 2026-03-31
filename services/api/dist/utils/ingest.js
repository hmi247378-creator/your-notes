/** 标签+冒号前缀：如 感悟：、总结：、会议：，表示整段为一条完整内容，不按句号拆分 */
const LABEL_COLON_PREFIX = /^[\u4e00-\u9fa5a-zA-Z]{2,10}：/;
export function splitIngestText(raw) {
    const text = raw.replace(/\r\n/g, '\n').trim();
    if (!text)
        return [];
    // 常见格式：
    // 1、xxx  2、yyy  —— 按序号拆分，每条独立
    // 感悟：这一年，我学会了... —— 标签+冒号表示整段为一条，不按句号拆分
    // - xxx  —— 每行一条
    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    /** 编号前缀正则：支持 1、1. 1) 1] 1，1, 等常见格式 */
    const numberedPrefix = /^\s*(\d+)\s*[、.．)\]\s，,]\s*/;
    // 如果用户整段在一行里，但包含多个编号，按编号切分（强烈推荐用户用序号区分事项）
    const numberedInline = text.match(/(^|\n)\s*\d+\s*[、.．)\]\s，,]\s*/g);
    if (lines.length === 1 && numberedInline) {
        return splitByNumbered(text);
    }
    // 多行：先合并「标签：」块（在 strip 前处理，保留编号行信息），再对每行去掉编号前缀
    const mergedBlocks = mergeLabeledBlocks(lines);
    let cleaned = mergedBlocks
        .map((block) => block
        .split('\n')
        .map((l) => l.replace(numberedPrefix, '').replace(/^\s*[-*]\s+/, '').trim())
        .filter(Boolean)
        .join('\n'))
        .filter(Boolean);
    // 若合并后只有 1 条且较长，尝试按句号/分号再拆
    // 例外：若以「标签：」开头，视为用户刻意标明的完整单条，不拆分
    if (cleaned.length === 1 && cleaned[0].length >= 15) {
        if (!LABEL_COLON_PREFIX.test(cleaned[0])) {
            const bySentence = splitBySentence(cleaned[0]);
            if (bySentence.length > 1)
                cleaned = bySentence;
        }
    }
    return cleaned.length ? cleaned : [text];
}
/** 将「标签：」开头的块与后续同属内容合并为一条；后续行若以编号开头则单独成条 */
function mergeLabeledBlocks(lines) {
    const out = [];
    let i = 0;
    const startsWithNumber = (s) => /^\s*\d+\s*[、.．)\]\s，,]\s*/.test(s);
    while (i < lines.length) {
        const line = lines[i];
        if (LABEL_COLON_PREFIX.test(line)) {
            const parts = [line];
            i++;
            while (i < lines.length && !LABEL_COLON_PREFIX.test(lines[i]) && !startsWithNumber(lines[i])) {
                parts.push(lines[i]);
                i++;
            }
            out.push(parts.join('\n'));
        }
        else {
            out.push(line);
            i++;
        }
    }
    return out;
}
/** 按句号、分号、空格等分隔符拆分，每段至少 5 字 */
function splitBySentence(s) {
    // 优先按句号、分号、双空格拆分（语义明确）
    let parts = s
        .split(/[。；;]|\s{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 5);
    // 若未拆开，且含空格，尝试按空格拆（常见：两句话贴成一行，如「安全生产工作总结 系统对账单」）
    // 每段至少 4 字，避免「系统对账单」「检查记录」等短主题被误过滤
    if (parts.length === 1 && /\s/.test(s) && s.length >= 15) {
        const bySpace = s
            .split(/\s+/)
            .map((p) => p.trim())
            .filter((p) => p.length >= 4);
        if (bySpace.length >= 2)
            parts = bySpace;
    }
    return parts.length > 1 ? parts : [s];
}
function splitByNumbered(text) {
    // 按编号前缀切：保留内容
    // 支持：1、xxx 2、yyy 或 1、xxx\n2、yyy，统一支持 、.．) ] ， , 等分隔符
    const parts = text
        .split(/\s*(?:^|\n)?\d+\s*[、.．)\]\s，,]\s*/g)
        .map((p) => p.trim().replace(/^[，,、\s]+|[，,、\s]+$/g, ''))
        .filter(Boolean);
    return parts;
}
