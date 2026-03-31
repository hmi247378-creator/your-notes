import type { FastifyRequest } from 'fastify';
import { unauthorized } from '../http/errors.js';
import { prisma } from '../prisma.js';

export async function requireAuth(request: FastifyRequest) {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized();
  }

  // 重要：token 可能来自旧数据库（例如重置 dev.db 后），此时 userId 不存在会触发外键错误。
  // 这里提前校验并返回 401，提示客户端重新登录。
  const userId = request.user.userId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw unauthorized('登录状态已失效，请重新登录');
}

