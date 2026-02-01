import type { FastifyPluginAsync } from 'fastify';
import {
  registerInputSchema,
  loginInputSchema,
  changePasswordInputSchema,
} from '@nonotion/shared';
import * as authService from '../services/auth-service.js';
import { authMiddleware } from '../middleware/auth.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register new user
  fastify.post('/api/auth/register', async (request, reply) => {
    try {
      const parsed = registerInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }

      const user = await authService.register(parsed.data);
      const publicUser = authService.toPublicUser(user);
      const token = fastify.jwt.sign({ userId: user.id, role: user.role });

      return reply.status(201).send({
        success: true,
        data: {
          user: publicUser,
          token,
          mustChangePassword: user.mustChangePassword,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      if (message.includes('already exists')) {
        return reply.status(409).send({
          success: false,
          error: { code: 'USER_EXISTS', message },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      });
    }
  });

  // Login
  fastify.post('/api/auth/login', async (request, reply) => {
    try {
      const parsed = loginInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }

      const user = await authService.login(parsed.data);
      const publicUser = authService.toPublicUser(user);
      const token = fastify.jwt.sign({ userId: user.id, role: user.role });

      return reply.send({
        success: true,
        data: {
          user: publicUser,
          token,
          mustChangePassword: user.mustChangePassword,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message },
      });
    }
  });

  // Get current user
  fastify.get('/api/auth/me', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const user = await authService.getCurrentUser(request.userId!);
      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const publicUser = authService.toPublicUser(user);
      return reply.send({
        success: true,
        data: {
          ...publicUser,
          mustChangePassword: user.mustChangePassword,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get user';
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      });
    }
  });

  // Change password
  fastify.post('/api/auth/change-password', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const parsed = changePasswordInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }

      const user = await authService.changePassword(request.userId!, parsed.data);
      const publicUser = authService.toPublicUser(user);

      return reply.send({
        success: true,
        data: publicUser,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      if (message.includes('incorrect')) {
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_PASSWORD', message },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      });
    }
  });
};
