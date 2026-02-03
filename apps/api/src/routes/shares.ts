import type { FastifyInstance } from 'fastify';
import { sharePageInputSchema, updateShareInputSchema } from '@nonotion/shared';
import * as permissionService from '../services/permission-service.js';
import { getUserStorage } from '../storage/storage-factory.js';
import { toPublicUser } from '../services/auth-service.js';
import { authMiddleware, mustChangePasswordMiddleware } from '../middleware/auth.js';

export async function sharesRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth and password change check to all routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);

  // GET /api/pages/:id/shares - List shares for a page (owner only)
  fastify.get<{ Params: { id: string } }>('/api/pages/:id/shares', async (request, reply) => {
    const canShare = await permissionService.canShare(request.params.id, request.userId!);
    if (!canShare) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the page owner can view shares' },
        success: false,
      });
    }

    const permissions = await permissionService.getPagePermissions(request.params.id);

    // Get user details for each permission
    const sharesWithUsers = await Promise.all(
      permissions.map(async (p) => {
        const user = await getUserStorage().getUser(p.userId);
        return {
          ...p,
          user: user ? toPublicUser(user) : null,
        };
      })
    );

    return reply.send({ data: sharesWithUsers, success: true });
  });

  // POST /api/pages/:id/shares - Add share (owner only)
  fastify.post<{ Params: { id: string } }>('/api/pages/:id/shares', async (request, reply) => {
    const canShare = await permissionService.canShare(request.params.id, request.userId!);
    if (!canShare) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the page owner can share pages' },
        success: false,
      });
    }

    const parsed = sharePageInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        success: false,
      });
    }

    // Check target user exists
    const targetUser = await getUserStorage().getUser(parsed.data.userId);
    if (!targetUser) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found' },
        success: false,
      });
    }

    // Cannot share with self
    if (parsed.data.userId === request.userId) {
      return reply.status(400).send({
        error: { code: 'INVALID_OPERATION', message: 'Cannot share with yourself' },
        success: false,
      });
    }

    try {
      const permission = await permissionService.sharePage(
        request.params.id,
        parsed.data.userId,
        parsed.data.level,
        request.userId!
      );

      return reply.status(201).send({
        data: {
          ...permission,
          user: toPublicUser(targetUser),
        },
        success: true,
      });
    } catch (error) {
      return reply.status(400).send({
        error: { code: 'INVALID_OPERATION', message: (error as Error).message },
        success: false,
      });
    }
  });

  // PATCH /api/pages/:id/shares/:userId - Update share level (owner only)
  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/api/pages/:id/shares/:userId',
    async (request, reply) => {
      const canShare = await permissionService.canShare(request.params.id, request.userId!);
      if (!canShare) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Only the page owner can update shares' },
          success: false,
        });
      }

      const parsed = updateShareInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
          success: false,
        });
      }

      try {
        const permission = await permissionService.sharePage(
          request.params.id,
          request.params.userId,
          parsed.data.level,
          request.userId!
        );

        const targetUser = await getUserStorage().getUser(request.params.userId);
        return reply.send({
          data: {
            ...permission,
            user: targetUser ? toPublicUser(targetUser) : null,
          },
          success: true,
        });
      } catch (error) {
        return reply.status(400).send({
          error: { code: 'INVALID_OPERATION', message: (error as Error).message },
          success: false,
        });
      }
    }
  );

  // DELETE /api/pages/:id/shares/:userId - Remove share (owner only)
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/api/pages/:id/shares/:userId',
    async (request, reply) => {
      const canShare = await permissionService.canShare(request.params.id, request.userId!);
      if (!canShare) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Only the page owner can remove shares' },
          success: false,
        });
      }

      try {
        const success = await permissionService.unshare(request.params.id, request.params.userId);
        if (!success) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'Share not found' },
            success: false,
          });
        }
        return reply.status(204).send();
      } catch (error) {
        return reply.status(400).send({
          error: { code: 'INVALID_OPERATION', message: (error as Error).message },
          success: false,
        });
      }
    }
  );
}
