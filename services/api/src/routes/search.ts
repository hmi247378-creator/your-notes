import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';

export async function registerSearchRoutes(app: FastifyInstance) {
  app.get('/api/search', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const schema = z.object({
      q: z.string().optional(),
      tagIds: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      /** 时间筛选字段：createdAt=创建时间，recordedAt=记录日期 */
      dateField: z.enum(['createdAt', 'recordedAt']).optional().default('createdAt'),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    });
    const query = schema.safeParse(req.query);
    if (!query.success) throw badRequest('Invalid query', query.error.flatten());

    const tagIds = query.data.tagIds ? query.data.tagIds.split(',').filter(Boolean) : [];
    const dateField = query.data.dateField ?? 'createdAt';

    const where: any = {
      userId,
      deletedAt: null,
      ...(query.data.q?.trim()
        ? { contentPlain: { contains: query.data.q.trim(), mode: 'insensitive' } }
        : {}),
      ...(tagIds.length ? { noteTags: { some: { tagId: { in: tagIds } } } } : {}),
      ...(query.data.from || query.data.to
        ? dateField === 'recordedAt'
          ? {
              recordedAt: {
                ...(query.data.from ? { gte: new Date(query.data.from) } : {}),
                ...(query.data.to ? { lte: new Date(query.data.to) } : {}),
              },
            }
          : {
              createdAt: {
                ...(query.data.from ? { gte: new Date(query.data.from) } : {}),
                ...(query.data.to ? { lte: new Date(query.data.to) } : {}),
              },
            }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.note.count({ where }),
      prisma.note.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.data.page - 1) * query.data.pageSize,
        take: query.data.pageSize,
        select: { id: true, contentPlain: true, createdAt: true, updatedAt: true, recordedAt: true, archived: true, noteTags: { select: { tagId: true } } },
      }),
    ]);

    return sendData(reply, {
      items: items.map((n) => ({
        id: n.id,
        contentPreview: n.contentPlain,
        tagIds: n.noteTags.map((t) => t.tagId),
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        recordedAt: n.recordedAt,
        archived: n.archived,
      })),
      page: query.data.page,
      pageSize: query.data.pageSize,
      total,
    });
  });
}

