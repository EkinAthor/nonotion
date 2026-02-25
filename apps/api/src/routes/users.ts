import type { FastifyInstance } from 'fastify';
import { adminResetPasswordInputSchema, updateUserRoleInputSchema, approveUserInputSchema, updateOwnerInputSchema } from '@nonotion/shared';
import * as userService from '../services/user-service.js';
import * as authService from '../services/auth-service.js';
import { authMiddleware, adminMiddleware, mustChangePasswordMiddleware } from '../middleware/auth.js';

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/users/list - List all users for property assignment (any authenticated user)
  fastify.get('/api/users/list', { preHandler: [authMiddleware, mustChangePasswordMiddleware] }, async (_request, reply) => {
    const users = await userService.getAllUsers();
    return reply.send({ data: users, success: true });
  });

  // GET /api/users - List all users (admin only)
  fastify.get('/api/users', { preHandler: [adminMiddleware, mustChangePasswordMiddleware] }, async (_request, reply) => {
    const users = await userService.getAllUsers();
    return reply.send({ data: users, success: true });
  });

  // GET /api/users/search - Search users by email (authenticated users)
  fastify.get<{ Querystring: { email?: string } }>(
    '/api/users/search',
    { preHandler: [authMiddleware, mustChangePasswordMiddleware] },
    async (request, reply) => {
      const email = request.query.email;
      if (!email || email.length < 2) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Email query must be at least 2 characters' },
          success: false,
        });
      }

      const users = await userService.searchUsersByEmail(email);
      return reply.send({ data: users, success: true });
    }
  );

  // GET /api/users/:id - Get user by ID (authenticated users)
  fastify.get<{ Params: { id: string } }>(
    '/api/users/:id',
    { preHandler: [authMiddleware, mustChangePasswordMiddleware] },
    async (request, reply) => {
      const user = await userService.getPublicUser(request.params.id);
      if (!user) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
          success: false,
        });
      }
      return reply.send({ data: user, success: true });
    }
  );

  // POST /api/users/:id/reset-password - Admin password reset (admin only)
  fastify.post<{ Params: { id: string } }>(
    '/api/users/:id/reset-password',
    { preHandler: [adminMiddleware, mustChangePasswordMiddleware] },
    async (request, reply) => {
      const parsed = adminResetPasswordInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
          success: false,
        });
      }

      try {
        const user = await authService.adminResetPassword(
          request.params.id,
          parsed.data.newPassword,
          parsed.data.mustChangePassword
        );
        return reply.send({
          data: authService.toPublicUser(user),
          success: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reset password';
        if (message.includes('not found')) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message },
            success: false,
          });
        }
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message },
          success: false,
        });
      }
    }
  );

  // PATCH /api/users/:id/role - Update user role (admin only)
  fastify.patch<{ Params: { id: string } }>(
    '/api/users/:id/role',
    { preHandler: [adminMiddleware, mustChangePasswordMiddleware] },
    async (request, reply) => {
      const parsed = updateUserRoleInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
          success: false,
        });
      }

      if (request.user?.userId === request.params.id) {
        return reply.status(400).send({
          error: { code: 'INVALID_OPERATION', message: 'Cannot change your own role' },
          success: false,
        });
      }

      try {
        const user = await userService.updateUserRole(request.params.id, parsed.data.role);
        return reply.send({
          data: user,
          success: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update user role';
        if (message.includes('not found')) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message },
            success: false,
          });
        }
        if (message.includes('Cannot demote')) {
          return reply.status(400).send({
            error: { code: 'INVALID_OPERATION', message },
            success: false,
          });
        }
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message },
          success: false,
        });
      }
    }
  );

  // PATCH /api/users/:id/owner - Update user owner status (admin only, verified as owner in service)
  fastify.patch<{ Params: { id: string } }>(
    '/api/users/:id/owner',
    { preHandler: [adminMiddleware, mustChangePasswordMiddleware] },
    async (request, reply) => {
      const parsed = updateOwnerInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
          success: false,
        });
      }

      try {
        const user = await userService.updateUserOwner(
          request.params.id,
          parsed.data.isOwner,
          request.userId!
        );
        return reply.send({
          data: user,
          success: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update owner status';
        if (message.includes('not found')) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message },
            success: false,
          });
        }
        if (message.includes('Only owners') || message.includes('Cannot remove')) {
          return reply.status(403).send({
            error: { code: 'FORBIDDEN', message },
            success: false,
          });
        }
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message },
          success: false,
        });
      }
    }
  );

  // DELETE /api/users/:id - Delete user (admin only)
  fastify.delete<{ Params: { id: string } }>(
    '/api/users/:id',
    { preHandler: [adminMiddleware, mustChangePasswordMiddleware] },
    async (request, reply) => {
      try {
        await userService.deleteUser(request.params.id, request.userId!);
        return reply.status(204).send();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete user';
        if (message.includes('not found')) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message },
            success: false,
          });
        }
        if (message.includes('Cannot delete')) {
          return reply.status(400).send({
            error: { code: 'INVALID_OPERATION', message },
            success: false,
          });
        }
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message },
          success: false,
        });
      }
    }
  );

  // PATCH /api/users/:id/approve - Approve or revoke user access (admin only)
  fastify.patch<{ Params: { id: string } }>(
    '/api/users/:id/approve',
    { preHandler: [adminMiddleware, mustChangePasswordMiddleware] },
    async (request, reply) => {
      const parsed = approveUserInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
          success: false,
        });
      }

      // Prevent unapproving self
      if (request.userId === request.params.id && !parsed.data.approved) {
        return reply.status(400).send({
          error: { code: 'INVALID_OPERATION', message: 'Cannot revoke your own approval' },
          success: false,
        });
      }

      try {
        const user = await userService.updateUserApproval(request.params.id, parsed.data.approved);
        return reply.send({
          data: user,
          success: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update user approval';
        if (message.includes('not found')) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message },
            success: false,
          });
        }
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message },
          success: false,
        });
      }
    }
  );
}
