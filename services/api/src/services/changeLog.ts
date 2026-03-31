import { prisma } from '../prisma.js';

export type EntityType = 'note' | 'tag' | 'ingestBatch';
export type ChangeOp = 'upsert' | 'delete';

export async function logChange(params: {
  userId: string;
  entityType: EntityType;
  entityId: string;
  op: ChangeOp;
  payload?: unknown;
}) {
  await prisma.changeLog.create({
    data: {
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
      op: params.op,
      payload: params.payload ?? undefined,
    },
  });
}

