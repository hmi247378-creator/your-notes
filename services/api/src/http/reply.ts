import type { FastifyReply } from 'fastify';
import { ApiError } from './errors.js';

export function sendData(reply: FastifyReply, data: unknown) {
  return reply.send({ data });
}

export function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof ApiError) {
    return reply.status(err.statusCode).send({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
}

