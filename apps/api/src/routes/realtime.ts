import type { FastifyInstance } from 'fastify';
import { SignJWT, importJWK, type CryptoKey, type KeyObject } from 'jose';
import { loadRealtimeConfig } from '../config/realtime.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';

// Cache the parsed private key at module scope so we don't re-parse JWK on every request.
// Invalidates if the env var value changes (e.g., hot reload in dev).
let cachedKey: { raw: string; key: CryptoKey | KeyObject | Uint8Array } | null = null;

async function getPrivateKey(jwkJson: string): Promise<CryptoKey | KeyObject | Uint8Array> {
  if (cachedKey && cachedKey.raw === jwkJson) return cachedKey.key;
  const jwk = JSON.parse(jwkJson);
  const key = await importJWK(jwk, 'ES256');
  cachedKey = { raw: jwkJson, key };
  return key;
}

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

    try {
      const privateKey = await getPrivateKey(config.supabaseJwtPrivateKey);
      const token = await new SignJWT({
        sub: request.userId,
        role: 'authenticated',
        is_owner: request.isOwner === true,
        iss: 'nonotion',
      })
        .setProtectedHeader({ alg: 'ES256', kid: config.supabaseJwtKid, typ: 'JWT' })
        .setExpirationTime(expiresAt)
        .setIssuedAt(now)
        .sign(privateKey);

      return reply.send({
        data: {
          enabled: true,
          token,
          expiresAt: new Date(expiresAt * 1000).toISOString(),
          supabaseUrl: config.supabaseUrl,
          supabasePublishableKey: config.supabasePublishableKey,
        },
        success: true,
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to sign Realtime JWT');
      return reply.status(500).send({
        success: false,
        error: { code: 'REALTIME_TOKEN_ERROR', message: 'Failed to sign Realtime token' },
      });
    }
  });
}
