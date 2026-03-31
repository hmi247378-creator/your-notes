import { prisma } from '../prisma.js';
/**
 * 返回 true 表示首次处理；false 表示重复提交（应当忽略并视为成功）。
 */
export async function markMutationProcessed(userId, clientMutationId) {
    try {
        await prisma.processedMutation.create({ data: { userId, clientMutationId } });
        return true;
    }
    catch (e) {
        // Prisma unique constraint violation: P2002
        if (e?.code === 'P2002')
            return false;
        throw e;
    }
}
