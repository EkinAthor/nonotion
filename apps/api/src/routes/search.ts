import type { FastifyInstance } from 'fastify';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';
import * as searchService from '../services/search-service.js';

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  fastify.get<{ Querystring: { q?: string } }>('/api/search', {
    config: {
      rateLimit: fastify.rateLimitEnabled
        ? { max: fastify.rateLimitConfig.search.max, timeWindow: fastify.rateLimitConfig.search.timeWindow }
        : false,
    },
  }, async (request, reply) => {
    const q = request.query.q;
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Query parameter "q" is required' },
        success: false,
      });
    }

    const results = await searchService.search(q.trim(), request.userId!, { isWorkspaceOwner: request.isOwner });
    return reply.send({ data: results, success: true });
  });
}
