import type { FastifyInstance } from 'fastify';
import { setMcpAccessInputSchema, createMcpTokenInputSchema, mcpConsentInputSchema } from '@nonotion/shared';
import {
  authMiddleware,
  mustChangePasswordMiddleware,
  approvedUserMiddleware,
} from '../middleware/auth.js';
import * as mcpAccessService from '../services/mcp-access-service.js';
import * as mcpPatService from '../services/mcp-pat-service.js';
import * as oauthService from '../mcp/oauth/oauth-service.js';
import { OAuthError } from '../mcp/oauth/oauth-service.js';
import { getStorage } from '../storage/storage-factory.js';

/**
 * REST endpoints backing the MCP settings UI (per-database access grants +
 * personal access tokens). Registered only when MCP_ENABLED=true.
 */
export async function mcpSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  // GET /api/mcp/access - the user's grants, enriched with database title/icon
  fastify.get('/api/mcp/access', async (request, reply) => {
    const grants = await mcpAccessService.listAccess(request.userId!);
    const pages = await getStorage().getPagesByIds(grants.map((g) => g.databaseId));
    const pageById = new Map(pages.map((p) => [p.id, p]));
    const data = grants.map((access) => {
      const page = pageById.get(access.databaseId);
      return {
        ...access,
        databaseTitle: page?.title ?? null,
        databaseIcon: page?.icon ?? null,
      };
    });
    return reply.send({ data, success: true });
  });

  // GET /api/mcp/access/:databaseId - single grant (null when not configured)
  fastify.get<{ Params: { databaseId: string } }>(
    '/api/mcp/access/:databaseId',
    async (request, reply) => {
      const access = await mcpAccessService.getAccess(request.userId!, request.params.databaseId);
      return reply.send({ data: access, success: true });
    }
  );

  // PUT /api/mcp/access/:databaseId - create/update grant
  fastify.put<{ Params: { databaseId: string } }>(
    '/api/mcp/access/:databaseId',
    async (request, reply) => {
      const parsed = setMcpAccessInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' },
          success: false,
        });
      }
      try {
        const access = await mcpAccessService.setAccess(
          { userId: request.userId!, isOwner: request.isOwner === true },
          request.params.databaseId,
          parsed.data
        );
        return reply.send({ data: access, success: true });
      } catch (error) {
        if (error instanceof mcpAccessService.McpAccessError) {
          const status = error.code === 'NOT_FOUND' ? 404 : 403;
          return reply.status(status).send({
            error: { code: error.code, message: error.message },
            success: false,
          });
        }
        throw error;
      }
    }
  );

  // DELETE /api/mcp/access/:databaseId - remove grant entirely
  fastify.delete<{ Params: { databaseId: string } }>(
    '/api/mcp/access/:databaseId',
    async (request, reply) => {
      await mcpAccessService.removeAccess(request.userId!, request.params.databaseId);
      return reply.send({ data: { removed: true }, success: true });
    }
  );

  // GET /api/mcp/tokens - list the user's PATs (metadata only)
  fastify.get('/api/mcp/tokens', async (request, reply) => {
    const tokens = await mcpPatService.listTokens(request.userId!);
    return reply.send({ data: tokens, success: true });
  });

  // POST /api/mcp/tokens - create a PAT; the full token is returned exactly once
  fastify.post('/api/mcp/tokens', async (request, reply) => {
    const parsed = createMcpTokenInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' },
        success: false,
      });
    }
    const result = await mcpPatService.createToken(request.userId!, parsed.data.name);
    return reply.status(201).send({ data: result, success: true });
  });

  // POST /api/mcp/oauth/consent - user approved the OAuth consent screen.
  // Re-validates all authorize params server-side and returns the redirect URL
  // carrying the single-use authorization code.
  fastify.post('/api/mcp/oauth/consent', async (request, reply) => {
    const parsed = mcpConsentInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' },
        success: false,
      });
    }
    try {
      const code = await oauthService.issueAuthorizationCode(request.userId!, parsed.data);
      const url = new URL(parsed.data.redirectUri);
      url.searchParams.set('code', code);
      if (parsed.data.state) url.searchParams.set('state', parsed.data.state);
      return reply.send({ data: { redirectUrl: url.toString() }, success: true });
    } catch (error) {
      if (error instanceof OAuthError) {
        return reply.status(400).send({
          error: { code: 'OAUTH_ERROR', message: error.message },
          success: false,
        });
      }
      throw error;
    }
  });

  // DELETE /api/mcp/tokens/:id - revoke a PAT
  fastify.delete<{ Params: { id: string } }>('/api/mcp/tokens/:id', async (request, reply) => {
    const removed = await mcpPatService.revokeToken(request.params.id, request.userId!);
    if (!removed) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Token not found' },
        success: false,
      });
    }
    return reply.send({ data: { removed: true }, success: true });
  });
}
