import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Client session identifier — unique per browser tab, sent via X-Client-Id header */
    clientId?: string;
  }
}

/**
 * Reads the X-Client-Id header and attaches it to the request.
 * Used by realtime broadcasts to distinguish the originating browser session
 * from other sessions belonging to the same user (enables multi-browser sync).
 *
 * Register as a global onRequest hook so every route has access to request.clientId.
 */
export async function clientIdMiddleware(request: FastifyRequest): Promise<void> {
  const header = request.headers['x-client-id'];
  if (typeof header === 'string' && header.length > 0) {
    request.clientId = header;
  }
}
