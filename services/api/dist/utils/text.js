export function toPlainText(md) {
    return md
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
        .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
        .replace(/[#>*_~\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
export function simpleTokens(text) {
    // Phase1：不引入重分词库，先做超轻量 token
    // - 英文/数字：按连续词
    // - 中文：对连续汉字片段生成 2-gram（能更好命中“会议/纪要/评审”等关键词）
    const normalized = text.toLowerCase();
    const parts = normalized.match(/[\p{Script=Han}]+|[a-z0-9]+/giu) ?? [];
    const out = [];
    for (const p of parts) {
        if (!p)
            continue;
        const isHan = /^[\p{Script=Han}]+$/u.test(p);
        if (!isHan) {
            out.push(p);
            continue;
        }
        // 保留原片段（有时标签名就是长片段）
        out.push(p);
        // 生成 2-gram，限制数量避免极端长文本拖慢
        const maxN = Math.min(p.length - 1, 60);
        for (let i = 0; i < maxN; i += 1) {
            out.push(p.slice(i, i + 2));
        }
    }
    return out;
}
