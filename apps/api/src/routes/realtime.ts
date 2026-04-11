import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { loadRealtimeConfig } from '../config/realtime.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';

export async function realtimeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  // GET /api/realtime/token - Get a Supabase Realtime auth token
  fastify.get('/api/realtime/token', async (request, reply) => {
    const config = loadRealtimeConfig();

    if (!config.enabled) {
      return reply.send({ data: { enabled: false }, success: true });
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600; // 1 hour

    const secret = new TextEncoder().encode(config.supabaseJwtSecret);
    const token = await new SignJWT({
      sub: request.userId,
      role: 'authenticated',
      is_owner: request.isOwner === true,
      iss: 'nonotion',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(expiresAt)
      .setIssuedAt(now)
      .sign(secret);

    return reply.send({
      data: {
        enabled: true,
        token,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        supabaseUrl: config.supabaseUrl,
        supabaseAnonKey: config.supabaseAnonKey,
      },
      success: true,
    });
  });
}
