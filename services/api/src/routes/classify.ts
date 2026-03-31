import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { badRequest } from '../http/errors.js';
import { sendData } from '../http/reply.js';
import { requireAuth } from '../plugins/auth.js';
import { classifyForUser } from '../services/classifier.js';

export async function registerClassifyRoutes(app: FastifyInstance) {
  app.post('/api/classify', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;
    const schema = z.object({ text: z.string().min(1) });
    const body = schema.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid classify payload', body.error.flatten());

    const { suggestions, explain } = await classifyForUser(userId, body.data.text, { preferLLM: true });

    const suggestion = await prisma.classificationSuggestion.create({
      data: {
        userId,
        inputText: body.data.text,
        suggestedTags: suggestions,
      },
      select: { id: true },
    });

    return sendData(reply, { suggestionId: suggestion.id, suggestions, explain });
  });
}

