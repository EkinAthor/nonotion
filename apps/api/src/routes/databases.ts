import type { FastifyInstance } from 'fastify';
import { databaseRowsQuerySchema } from '@nonotion/shared';
import * as databaseService from '../services/database-service.js';
import * as permissionService from '../services/permission-service.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';

export async function databasesRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth, password change check, and approval check to all routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  // GET /api/databases/:id/rows - Get database rows with sort/filter
  fastify.get<{
    Params: { id: string };
    Querystring: { sort?: string; filter?: string; limit?: string; offset?: string };
  }>('/api/databases/:id/rows', async (request, reply) => {
    const canRead = await permissionService.canRead(request.params.id, request.userId!);
    if (!canRead) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Database not found' },
        success: false,
      });
    }

    const parsed = databaseRowsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    try {
      const result = await databaseService.getRows(request.params.id, parsed.data);
      return reply.send({
        data: result,
        success: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get rows';
      return reply.status(400).send({
        error: { code: 'DATABASE_ERROR', message },
        success: false,
      });
    }
  });
}
