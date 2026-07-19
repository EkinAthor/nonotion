import type { FastifyInstance } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from './mcp-server.js';
import { mcpAuthPreHandler } from './mcp-auth.js';

/**
 * The MCP endpoint (Streamable HTTP transport, stateless mode).
 *
 * A fresh McpServer + transport pair is created per request — the SDK's
 * documented stateless pattern. No sessions, no SSE (enableJsonResponse), all
 * auth/permission state re-checked per call: serverless-safe.
 */
export async function mcpRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/mcp', {
    config: {
      rateLimit: fastify.rateLimitEnabled
        ? { max: fastify.rateLimitConfig.mcp.max, timeWindow: fastify.rateLimitConfig.mcp.timeWindow }
        : false,
    },
    preHandler: mcpAuthPreHandler,
  }, async (request, reply) => {
    const server = buildMcpServer(request.mcpAuth!);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Hand the raw req/res to the SDK transport; Fastify must not touch the
    // response after this point.
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // Stateless server: no SSE notification stream, no sessions to delete.
  const methodNotAllowed = async (_request: unknown, reply: import('fastify').FastifyReply) => {
    reply.status(405).send({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed (stateless server)' },
      id: null,
    });
  };
  fastify.get('/mcp', methodNotAllowed);
  fastify.delete('/mcp', methodNotAllowed);
}
