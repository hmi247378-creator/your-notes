import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadEnv } from './env.js';
import { sendError } from './http/reply.js';
import { registerJwt } from './plugins/jwt.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerTagRoutes } from './routes/tags.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerClassifyRoutes } from './routes/classify.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerReminderRoutes } from './routes/reminders.js';
const env = loadEnv();
const app = Fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
    },
});
app.setErrorHandler((err, _req, reply) => sendError(reply, err));
// 重要：Web(3000) -> API(3001) 跨域，需要允许 PATCH/DELETE 及 Authorization 头
await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
});
await app.register(swagger, {
    openapi: {
        info: { title: 'Your Notes API', version: '0.1.0' },
    },
});
await app.register(swaggerUi, { routePrefix: '/api/docs' });
await registerJwt(app, env.JWT_SECRET);
app.get('/api/health', async () => ({ ok: true }));
await registerAuthRoutes(app);
await registerTagRoutes(app);
await registerNoteRoutes(app);
await registerSearchRoutes(app);
await registerClassifyRoutes(app);
await registerFeedbackRoutes(app);
await registerSyncRoutes(app);
await registerReportRoutes(app);
await registerReminderRoutes(app);
await app.listen({ port: env.PORT, host: '0.0.0.0' });
