import type { FastifyPluginAsync } from 'fastify';
import {
  registerInputSchema,
  loginInputSchema,
  changePasswordInputSchema,
  googleLoginInputSchema,
  verifyTwoFactorInputSchema,
  confirmTwoFactorInputSchema,
  disableTwoFactorInputSchema,
} from '@nonotion/shared';
import * as authService from '../services/auth-service.js';
import { authMiddleware } from '../middleware/auth.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Get auth config (public, no auth needed)
  fastify.get('/api/auth/config', async (_request, reply) => {
    const enabledModes = authService.getEnabledAuthModes();
    const googleClientId = process.env.GOOGLE_CLIENT_ID || null;

    return reply.send({
      success: true,
      data: {
        enabledModes,
        googleClientId: enabledModes.includes('google') ? googleClientId : null,
      },
    });
  });

  // Register new user
  fastify.post('/api/auth/register', {
    config: {
      rateLimit: fastify.rateLimitEnabled
        ? { max: fastify.rateLimitConfig.auth.max, timeWindow: fastify.rateLimitConfig.auth.timeWindow }
        : false,
    },
  }, async (request, reply) => {
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
      const token = fastify.jwt.sign({ userId: user.id, role: user.role, isOwner: user.isOwner });

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
      if (message.includes('not enabled')) {
        return reply.status(403).send({
          success: false,
          error: { code: 'AUTH_MODE_DISABLED', message },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      });
    }
  });

  // Login
  fastify.post('/api/auth/login', {
    config: {
      rateLimit: fastify.rateLimitEnabled
        ? { max: fastify.rateLimitConfig.auth.max, timeWindow: fastify.rateLimitConfig.auth.timeWindow }
        : false,
    },
  }, async (request, reply) => {
    try {
      const parsed = loginInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }

      const user = await authService.login(parsed.data);

      // If the account has email 2FA enabled, do NOT issue the real token yet.
      // Email a code and return a short-lived pending token to exchange later.
      if (user.twoFactorEnabled) {
        await authService.issueTwoFactorChallenge(user, 'login');
        const pendingToken = fastify.jwt.sign(
          { userId: user.id, twoFactorPending: true },
          { expiresIn: '10m' }
        );
        return reply.send({
          success: true,
          data: { twoFactorRequired: true, pendingToken },
        });
      }

      const publicUser = authService.toPublicUser(user);
      const token = fastify.jwt.sign({ userId: user.id, role: user.role, isOwner: user.isOwner });

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
      if (message.includes('not enabled') || message.includes('Google login')) {
        return reply.status(403).send({
          success: false,
          error: { code: 'AUTH_MODE_DISABLED', message },
        });
      }
      // Email delivery / configuration failures while issuing the 2FA code
      if (message.includes('verification email') || message.includes('Email is not configured')) {
        return reply.status(500).send({
          success: false,
          error: { code: 'EMAIL_SEND_FAILED', message },
        });
      }
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message },
      });
    }
  });

  // Verify a 2FA login challenge — exchange pendingToken + code for a real token
  fastify.post('/api/auth/login/verify-2fa', {
    config: {
      rateLimit: fastify.rateLimitEnabled
        ? { max: fastify.rateLimitConfig.auth.max, timeWindow: fastify.rateLimitConfig.auth.timeWindow }
        : false,
    },
  }, async (request, reply) => {
    try {
      const parsed = verifyTwoFactorInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }

      // Verify the short-lived pending token
      let userId: string;
      try {
        const decoded = fastify.jwt.verify<{ userId: string; twoFactorPending?: boolean }>(parsed.data.pendingToken);
        if (!decoded.twoFactorPending) {
          throw new Error('invalid');
        }
        userId = decoded.userId;
      } catch {
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_PENDING_TOKEN', message: 'Your sign-in session expired. Please log in again.' },
        });
      }

      const user = await authService.verifyTwoFactorCode(userId, parsed.data.code, 'login');
      const publicUser = authService.toPublicUser(user);
      const token = fastify.jwt.sign({ userId: user.id, role: user.role, isOwner: user.isOwner });

      return reply.send({
        success: true,
        data: {
          user: publicUser,
          token,
          mustChangePassword: user.mustChangePassword,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      return reply.status(401).send({
        success: false,
        error: { code: 'TWO_FACTOR_FAILED', message },
      });
    }
  });

  // Google login
  fastify.post('/api/auth/google', {
    config: {
      rateLimit: fastify.rateLimitEnabled
        ? { max: fastify.rateLimitConfig.auth.max, timeWindow: fastify.rateLimitConfig.auth.timeWindow }
        : false,
    },
  }, async (request, reply) => {
    try {
      const parsed = googleLoginInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }

      const user = await authService.googleLogin(parsed.data.credential);
      const publicUser = authService.toPublicUser(user);
      const token = fastify.jwt.sign({ userId: user.id, role: user.role, isOwner: user.isOwner });

      return reply.send({
        success: true,
        data: {
          user: publicUser,
          token,
          mustChangePassword: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google login failed';
      if (message.includes('not enabled') || message.includes('not configured')) {
        return reply.status(403).send({
          success: false,
          error: { code: 'AUTH_MODE_DISABLED', message },
        });
      }
      return reply.status(401).send({
        success: false,
        error: { code: 'GOOGLE_AUTH_FAILED', message },
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
      if (message.includes('Google login')) {
        return reply.status(403).send({
          success: false,
          error: { code: 'GOOGLE_ONLY_ACCOUNT', message },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      });
    }
  });

  // Begin enabling 2FA — email a confirmation code to the current user
  fastify.post('/api/auth/2fa/initiate', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const user = await authService.getCurrentUser(request.userId!);
      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      await authService.issueTwoFactorChallenge(user, 'enable');
      return reply.send({ success: true, data: { sent: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send verification code';
      if (message.includes('no password')) {
        return reply.status(403).send({
          success: false,
          error: { code: 'GOOGLE_ONLY_ACCOUNT', message },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'EMAIL_SEND_FAILED', message },
      });
    }
  });

  // Confirm the emailed code and turn 2FA on
  fastify.post('/api/auth/2fa/confirm', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const parsed = confirmTwoFactorInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }

      await authService.verifyTwoFactorCode(request.userId!, parsed.data.code, 'enable');
      const user = await authService.enableTwoFactor(request.userId!);

      return reply.send({ success: true, data: authService.toPublicUser(user) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enable two-factor authentication';
      return reply.status(401).send({
        success: false,
        error: { code: 'TWO_FACTOR_FAILED', message },
      });
    }
  });

  // Disable 2FA — requires the current password
  fastify.post('/api/auth/2fa/disable', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const parsed = disableTwoFactorInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }

      const user = await authService.disableTwoFactor(request.userId!, parsed.data.password);
      return reply.send({ success: true, data: authService.toPublicUser(user) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to disable two-factor authentication';
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
