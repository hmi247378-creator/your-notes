import fastifyJwt from '@fastify/jwt';
export async function registerJwt(app, jwtSecret) {
    await app.register(fastifyJwt, { secret: jwtSecret });
}
