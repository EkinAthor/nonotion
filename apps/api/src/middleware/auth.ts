import type { FastifyRequest, FastifyReply } from 'fastify';
import { getUserStorage } from '../storage/storage-factory.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userRole?: 'admin' | 'user';
    isOwner?: boolean;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // `twoFactorPending` tokens are short-lived login-challenge tokens and must
    // never be accepted as normal auth tokens (see authMiddleware guard below).
    payload:
      | { userId: string; role: 'admin' | 'user'; isOwner: boolean; twoFactorPending?: false }
      | { userId: string; twoFactorPending: true };
    user: { userId: string; role: 'admin' | 'user'; isOwner: boolean; twoFactorPending?: boolean };
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const decoded = await request.jwtVerify<{ userId: string; role: 'admin' | 'user'; isOwner?: boolean; twoFactorPending?: boolean }>();
    // Reject login-challenge tokens — they are not a completed authentication.
    if (decoded.twoFactorPending) {
      throw new Error('Two-factor challenge not completed');
    }
    request.userId = decoded.userId;
    request.userRole = decoded.role;
    request.isOwner = decoded.isOwner === true;
  } catch {
    reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or missing authentication token' },
    });
  }
}

export async function optionalAuthMiddleware(request: FastifyRequest): Promise<void> {
  try {
    const decoded = await request.jwtVerify<{ userId: string; role: 'admin' | 'user'; isOwner?: boolean; twoFactorPending?: boolean }>();
    if (decoded.twoFactorPending) {
      throw new Error('Two-factor challenge not completed');
    }
    request.userId = decoded.userId;
    request.userRole = decoded.role;
    request.isOwner = decoded.isOwner === true;
  } catch {
    // No token or invalid token - that's fine, just continue without auth
    request.userId = undefined;
    request.userRole = undefined;
    request.isOwner = undefined;
  }
}

export async function adminMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // First verify JWT
  await authMiddleware(request, reply);
  if (reply.sent) return;

  // Then check admin role
  if (request.userRole !== 'admin') {
    reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
  }
}

export async function mustChangePasswordMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.userId) return;

  const user = await getUserStorage().getUser(request.userId);
  if (user?.mustChangePassword) {
    // Allow access to change-password endpoint
    if (request.url === '/api/auth/change-password' && request.method === 'POST') {
      return;
    }
    // Allow access to /me endpoint to check status
    if (request.url === '/api/auth/me' && request.method === 'GET') {
      return;
    }

    reply.status(403).send({
      success: false,
      error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your password before continuing' },
    });
  }
}

export async function approvedUserMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.userId) return;

  const user = await getUserStorage().getUser(request.userId);
  if (!user) return;

  // Admins are always allowed
  if (user.role === 'admin') return;

  // Allow unapproved users to access auth endpoints to check status and logout
  if (request.url === '/api/auth/me' && request.method === 'GET') return;
  if (request.url === '/api/auth/logout' && request.method === 'POST') return;

  if (!user.approved) {
    reply.status(403).send({
      success: false,
      error: { code: 'APPROVAL_REQUIRED', message: 'Your account is pending admin approval' },
    });
  }
}
