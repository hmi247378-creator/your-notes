import { prisma } from '../prisma.js';
import { simpleTokens } from '../utils/text.js';
const MAX_NOTES_TO_SCAN = 150;
const MAX_SNIPPETS_PER_TAG = 2;
const SNIPPET_LEN = 80;
const MAX_RECORD_TOKENS_PER_TAG = 60;
/**
 * 获取各标签下已有记录的画像
 * - 从最近记录中提取词汇，反映用户在该标签下的实际用词习惯
 * - 抽取代表性摘要，供 LLM 理解该标签下内容风格
 */
export async function getTagRecordProfiles(userId) {
    const notesWithTags = await prisma.note.findMany({
        where: { userId, deletedAt: null },
        select: { contentPlain: true, noteTags: { select: { tagId: true } } },
        orderBy: { createdAt: 'desc' },
        take: MAX_NOTES_TO_SCAN,
    });
    // tagId -> { contents: string[], ... }
    const byTag = new Map();
    for (const n of notesWithTags) {
        for (const nt of n.noteTags) {
            const list = byTag.get(nt.tagId) ?? [];
            list.push(n.contentPlain);
            byTag.set(nt.tagId, list);
        }
    }
    const profiles = new Map();
    for (const [tagId, contents] of byTag) {
        const recordTokens = {};
        for (const c of contents) {
            const tokens = simpleTokens(c)
                .map((t) => t.trim().toLowerCase())
                .filter((t) => t.length >= 2);
            for (const t of tokens) {
                recordTokens[t] = (recordTokens[t] ?? 0) + 1;
            }
        }
        // 按频次排序，取 top 词
        const trimmed = Object.entries(recordTokens)
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_RECORD_TOKENS_PER_TAG)
            .reduce((acc, [k, v]) => {
            acc[k] = v;
            return acc;
        }, {});
        // 取前几条记录的开头作为摘要（去重、截断）
        const seen = new Set();
        const sampleSnippets = [];
        for (const c of contents) {
            const snip = c.slice(0, SNIPPET_LEN).trim();
            const key = snip.slice(0, 40);
            if (!seen.has(key) && snip.length >= 5) {
                seen.add(key);
                sampleSnippets.push(snip + (c.length > SNIPPET_LEN ? '…' : ''));
                if (sampleSnippets.length >= MAX_SNIPPETS_PER_TAG)
                    break;
            }
        }
        profiles.set(tagId, {
            tagId,
            recordTokens: trimmed,
            sampleSnippets,
        });
    }
    return profiles;
}
