import type { FastifyInstance } from 'fastify';
import { databaseRowsQuerySchema, updateKanbanCardOrderInputSchema } from '@nonotion/shared';
import * as databaseService from '../services/database-service.js';
import * as permissionService from '../services/permission-service.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';
import { getBroadcaster } from '../realtime/realtime-factory.js';

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
    const canRead = await permissionService.canRead(request.params.id, request.userId!, { isWorkspaceOwner: request.isOwner });
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

  // PATCH /api/databases/:id/kanban-order - Update kanban card order
  fastify.patch<{
    Params: { id: string };
    Body: unknown;
  }>('/api/databases/:id/kanban-order', async (request, reply) => {
    const canEdit = await permissionService.canEdit(request.params.id, request.userId!, { isWorkspaceOwner: request.isOwner });
    if (!canEdit) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'No edit permission' },
        success: false,
      });
    }

    const parsed = updateKanbanCardOrderInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    try {
      const page = await databaseService.updateKanbanCardOrder(request.params.id, parsed.data);
      if (!page) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Database not found' },
          success: false,
        });
      }
      getBroadcaster().broadcastToDatabase(request.params.id, 'card_move', {
        databaseId: request.params.id, kanbanCardOrder: page.databaseSchema?.kanbanCardOrder,
        userId: request.userId, clientId: request.clientId,
      }).catch(err => fastify.log.warn(err, 'Failed to broadcast card_move'));
      return reply.send({ data: page, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update kanban order';
      return reply.status(400).send({
        error: { code: 'DATABASE_ERROR', message },
        success: false,
      });
    }
  });
}
