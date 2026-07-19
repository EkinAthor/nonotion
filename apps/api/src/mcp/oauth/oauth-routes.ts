import type { FastifyInstance, FastifyReply } from 'fastify';
import formbody from '@fastify/formbody';
import { loadMcpConfig } from '../../config/mcp.js';
import { getMcpStorage } from '../../storage/storage-factory.js';
import * as oauthService from './oauth-service.js';
import { OAuthError, MCP_SCOPE } from './oauth-service.js';

/**
 * OAuth 2.1 authorization + resource server endpoints for MCP clients
 * (claude.ai custom connectors, Claude Desktop, Claude Code).
 *
 * These speak RFC-shaped JSON (not the app's {data, success} wrapper).
 */
export async function mcpOAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // Token endpoint receives application/x-www-form-urlencoded bodies.
  await fastify.register(formbody);

  const config = loadMcpConfig();
  const authTier = fastify.rateLimitEnabled
    ? { max: fastify.rateLimitConfig.auth.max, timeWindow: fastify.rateLimitConfig.auth.timeWindow }
    : false;

  // ── Discovery metadata (RFC 9728 + RFC 8414) ──────────────────────────────

  const protectedResourceMetadata = {
    resource: `${config.publicUrl}/mcp`,
    authorization_servers: [config.publicUrl],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
  };

  // Clients probe both the root document and the resource-path variant.
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    fastify.get(path, { config: { rateLimit: false } }, async (_request, reply) => {
      return reply.send(protectedResourceMetadata);
    });
  }

  fastify.get('/.well-known/oauth-authorization-server', { config: { rateLimit: false } }, async (_request, reply) => {
    return reply.send({
      issuer: config.publicUrl,
      authorization_endpoint: `${config.publicUrl}/mcp/oauth/authorize`,
      token_endpoint: `${config.publicUrl}/mcp/oauth/token`,
      registration_endpoint: `${config.publicUrl}/mcp/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [MCP_SCOPE],
    });
  });

  // ── Dynamic client registration (RFC 7591) ────────────────────────────────

  fastify.post('/mcp/oauth/register', { config: { rateLimit: authTier } }, async (request, reply) => {
    try {
      const client = await oauthService.registerClient(
        (request.body ?? {}) as oauthService.RegisterClientInput
      );
      return reply.status(201).send({
        client_id: client.id,
        client_id_issued_at: Math.floor(new Date(client.createdAt).getTime() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      });
    } catch (error) {
      return sendOAuthError(reply, error);
    }
  });

  // ── Authorization endpoint ────────────────────────────────────────────────

  fastify.get<{ Querystring: Record<string, string> }>(
    '/mcp/oauth/authorize',
    { config: { rateLimit: authTier } },
    async (request, reply) => {
      const q = request.query;

      // Client/redirect_uri problems must never redirect anywhere.
      try {
        await oauthService.validateClientAndRedirect(q.client_id, q.redirect_uri);
      } catch (error) {
        const message = error instanceof OAuthError ? error.message : 'Invalid request';
        return reply
          .status(400)
          .type('text/html')
          .send(`<!doctype html><h1>Authorization error</h1><p>${escapeHtml(message)}</p>`);
      }

      // Everything else is reported back to the client via redirect.
      const paramError = oauthService.validateAuthorizeParams(q);
      if (paramError) {
        const url = new URL(q.redirect_uri);
        url.searchParams.set('error', paramError);
        if (q.state) url.searchParams.set('state', q.state);
        return reply.redirect(url.toString(), 302);
      }

      // Hand off to the SPA consent screen with the original query intact.
      const consentUrl = new URL(`${config.frontendUrl}/mcp/consent`);
      for (const [key, value] of Object.entries(q)) {
        consentUrl.searchParams.set(key, value);
      }
      return reply.redirect(consentUrl.toString(), 302);
    }
  );

  // Public client info for the consent screen (name + redirect host only).
  // Lives under /api so the SPA client can use its normal base URL.
  fastify.get<{ Querystring: { client_id?: string } }>(
    '/api/mcp/oauth/client-info',
    { config: { rateLimit: authTier } },
    async (request, reply) => {
      const clientId = request.query.client_id;
      const client = clientId ? await getMcpStorage().getOAuthClient(clientId) : null;
      if (!client) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Unknown client' },
          success: false,
        });
      }
      let redirectHost = '';
      try {
        redirectHost = new URL(client.redirectUris[0]).host;
      } catch {
        // leave empty
      }
      return reply.send({
        data: { clientId: client.id, name: client.name, redirectHost },
        success: true,
      });
    }
  );

  // ── Token endpoint ────────────────────────────────────────────────────────

  fastify.post('/mcp/oauth/token', { config: { rateLimit: authTier } }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    const signer = {
      sign: (payload: { userId: string; mcpScope: 'read'; aud: string }, options: { expiresIn: string }) =>
        fastify.jwt.sign(payload, options),
    };

    try {
      let tokens: oauthService.IssuedTokens;
      if (body.grant_type === 'authorization_code') {
        tokens = await oauthService.exchangeAuthorizationCode(signer, body);
      } else if (body.grant_type === 'refresh_token') {
        tokens = await oauthService.exchangeRefreshToken(signer, body);
      } else {
        throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
      }
      return reply
        .header('Cache-Control', 'no-store')
        .send({
          access_token: tokens.accessToken,
          token_type: 'Bearer',
          expires_in: tokens.expiresInSeconds,
          refresh_token: tokens.refreshToken,
          scope: tokens.scope,
        });
    } catch (error) {
      return sendOAuthError(reply, error);
    }
  });
}

function sendOAuthError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof OAuthError) {
    return reply.status(400).send({ error: error.code, error_description: error.message });
  }
  console.error('OAuth endpoint error:', error);
  return reply.status(500).send({ error: 'server_error', error_description: 'Internal error' });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
