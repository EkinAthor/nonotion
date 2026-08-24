import type { FastifyInstance } from 'fastify';
import * as permissionService from '../services/permission-service.js';
import { exportDatabase } from '../services/export/simple-export-service.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';
import { contentDisposition } from '../utils/http.js';

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  // GET /api/databases/:id/export — self-contained markdown ZIP of a database.
  // Heavy operation: reuses the import rate-limit tier.
  fastify.get<{ Params: { id: string } }>(
    '/api/databases/:id/export',
    {
      config: {
        rateLimit: fastify.rateLimitEnabled
          ? {
              max: fastify.rateLimitConfig.import.max,
              timeWindow: fastify.rateLimitConfig.import.timeWindow,
            }
          : false,
      },
    },
    async (request, reply) => {
      const canRead = await permissionService.canRead(request.params.id, request.userId!, {
        isWorkspaceOwner: request.isOwner,
      });
      if (!canRead) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Database not found' },
          success: false,
        });
      }

      try {
        const result = await exportDatabase(request.params.id, {
          userId: request.userId!,
          isOwner: request.isOwner === true,
        });
        if (!result) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'Database not found' },
            success: false,
          });
        }

        return reply
          .header('Content-Type', 'application/zip')
          .header('Content-Length', result.buffer.length)
          .header('Content-Disposition', contentDisposition('attachment', result.filename))
          .header('X-Content-Type-Options', 'nosniff')
          .header('Cache-Control', 'private, no-store')
          .send(result.buffer);
      } catch (error) {
        fastify.log.error(error, 'Database export failed');
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Export failed' },
          success: false,
        });
      }
    }
  );
}
