import { prisma } from '../prisma.js';
import { simpleTokens } from '../utils/text.js';
function extractCandidateTokens(text) {
    // 充分吸收用户录入：2-gram + 3/4 字短语，更好命中「安全工作」「安全事项」「联络单」等
    const fromSimple = simpleTokens(text)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
    const normalized = text.toLowerCase();
    const hanParts = normalized.match(/[\p{Script=Han}]+/gu) ?? [];
    const longerPhrases = [];
    for (const p of hanParts) {
        if (p.length < 3)
            continue;
        const maxN = Math.min(p.length - 2, 30);
        for (let i = 0; i < maxN; i += 1) {
            const three = p.slice(i, i + 3);
            if (three.length === 3)
                longerPhrases.push(three);
            const four = p.slice(i, i + 4);
            if (four.length === 4)
                longerPhrases.push(four);
        }
    }
    const combined = [...new Set([...fromSimple, ...longerPhrases])].filter((t) => t.length >= 2);
    return combined.slice(0, 100);
}
function mergeCounts(existing, tokens) {
    const next = { ...existing };
    for (const t of tokens)
        next[t] = (next[t] ?? 0) + 1;
    return next;
}
function trimCounts(counts, maxKeys = 60) {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const trimmed = {};
    for (const [k, v] of entries.slice(0, maxKeys))
        trimmed[k] = v;
    return trimmed;
}
export async function strengthenTagsFromText(params) {
    const tokens = extractCandidateTokens(params.text);
    if (tokens.length === 0 || params.tagIds.length === 0)
        return;
    const tags = await prisma.tag.findMany({
        where: { userId: params.userId, id: { in: params.tagIds } },
        select: { id: true, keywords: true },
    });
    const now = new Date().toISOString();
    for (const tag of tags) {
        const manual = Array.isArray(tag.keywords?.manual) ? (tag.keywords.manual ?? []) : [];
        const existingCounts = tag.keywords?.counts && typeof tag.keywords.counts === 'object'
            ? tag.keywords.counts
            : {};
        const merged = trimCounts(mergeCounts(existingCounts, tokens), 60);
        const next = { manual, counts: merged, updatedAt: now };
        await prisma.tag.update({ where: { id: tag.id }, data: { keywords: next } });
    }
}
export function normalizeManualKeywords(input) {
    const cleaned = input
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.length >= 2);
    return [...new Set(cleaned)].slice(0, 20);
}
export function buildKeywordsFromManual(manual) {
    const now = new Date().toISOString();
    const counts = {};
    for (const k of manual)
        counts[k] = Math.max(counts[k] ?? 0, 3);
    return { manual, counts, updatedAt: now };
}
