import type { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';

export type JwtUser = { userId: string };

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

export async function registerJwt(app: FastifyInstance, jwtSecret: string) {
  await app.register(fastifyJwt, { secret: jwtSecret });
}

