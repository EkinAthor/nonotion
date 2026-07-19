import type { FastifyReply, FastifyRequest } from 'fastify';
import type { McpViewer } from '../services/mcp-access-service.js';
import * as mcpPatService from '../services/mcp-pat-service.js';
import { getUserStorage } from '../storage/storage-factory.js';
import { loadMcpConfig } from '../config/mcp.js';

export const MCP_JWT_AUDIENCE = 'nonotion-mcp';

declare module 'fastify' {
  interface FastifyRequest {
    mcpAuth?: McpViewer;
  }
}

interface McpJwtPayload {
  userId?: string;
  mcpScope?: string;
  aud?: string;
  twoFactorPending?: boolean;
}

/**
 * Bearer auth for the /mcp endpoint. Accepts either a PAT (nmcp_...) or an
 * MCP-scoped OAuth access token (our JWT with aud=nonotion-mcp). Session JWTs
 * are rejected — MCP and app tokens are strictly separated in both directions.
 *
 * The user row is fetched fresh on every request: deleted or unapproved users
 * lose access immediately, and isOwner reflects the current state.
 */
export async function mcpAuthPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;

  if (!token) {
    return sendUnauthorized(reply, 'Missing bearer token');
  }

  let userId: string | null = null;

  if (token.startsWith('nmcp_')) {
    const pat = await mcpPatService.verifyToken(token);
    if (!pat) return sendUnauthorized(reply, 'Invalid access token');
    userId = pat.userId;
  } else {
    let payload: McpJwtPayload;
    try {
      payload = request.server.jwt.verify<McpJwtPayload>(token);
    } catch {
      return sendUnauthorized(reply, 'Invalid access token');
    }
    // Only MCP-scoped tokens are valid here — reject session and 2FA tokens.
    if (
      payload.aud !== MCP_JWT_AUDIENCE ||
      payload.mcpScope !== 'read' ||
      payload.twoFactorPending ||
      !payload.userId
    ) {
      return sendUnauthorized(reply, 'Token is not valid for MCP access');
    }
    userId = payload.userId;
  }

  const user = await getUserStorage().getUser(userId);
  if (!user) return sendUnauthorized(reply, 'Unknown user');
  if (!user.approved) return sendUnauthorized(reply, 'Account is pending approval');

  request.mcpAuth = { userId: user.id, isOwner: user.isOwner };
}

function sendUnauthorized(reply: FastifyReply, message: string): void {
  const { publicUrl } = loadMcpConfig();
  // The resource_metadata pointer is what triggers OAuth discovery in MCP clients.
  reply
    .status(401)
    .header(
      'WWW-Authenticate',
      `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`
    )
    .send({
      jsonrpc: '2.0',
      error: { code: -32001, message: `Unauthorized: ${message}` },
      id: null,
    });
}
