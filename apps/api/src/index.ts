import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fs from 'fs';
import path from 'path';
import { pagesRoutes } from './routes/pages.js';
import { blocksRoutes } from './routes/blocks.js';
import { authRoutes } from './routes/auth.js';
import { sharesRoutes } from './routes/shares.js';
import { usersRoutes } from './routes/users.js';
import { databasesRoutes } from './routes/databases.js';
import { filesRoutes } from './routes/files.js';
import { importRoutes } from './routes/import.js';
import { searchRoutes } from './routes/search.js';
import { realtimeRoutes } from './routes/realtime.js';
import { initializeStorage, getStorageType, type StorageType } from './storage/storage-factory.js';
import { ensureAdminPasswordReset } from './services/auth-service.js';
import { runWithRequestContext } from './services/request-context.js';
import { registerRateLimit } from './config/rate-limit.js';
import { isMcpEnabled } from './config/mcp.js';
import { loadRealtimeConfig } from './config/realtime.js';
import { initializeBroadcaster } from './realtime/realtime-factory.js';
import { clientIdMiddleware } from './middleware/client-id.js';

// Determine storage type from environment
const storageType: StorageType = (process.env.STORAGE_TYPE as StorageType) || 'sqlite';

// Initialize storage first
await initializeStorage({
  type: storageType,
  postgresUrl: process.env.DATABASE_URL,
});

// Run appropriate migrations based on storage type
if (getStorageType() === 'postgres') {
  // PostgreSQL migrations
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  // process.cwd() is apps/api locally, but the monorepo root on Vercel
  const pgCandidates = [
    path.resolve(process.cwd(), 'drizzle-pg'),
    path.resolve(process.cwd(), 'apps', 'api', 'drizzle-pg'),
  ];
  const pgMigrationsFolder = pgCandidates.find(p => fs.existsSync(p)) || pgCandidates[0];

  try {
    await migrate(db, { migrationsFolder: pgMigrationsFolder });
    console.log('PostgreSQL migrations complete');
  } catch (error) {
    console.error('PostgreSQL migration error:', error);
  } finally {
    await pool.end();
  }
} else {
  // SQLite migrations (default)
  const { db } = await import('./db/index.js');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const sqliteCandidates = [
    path.resolve(process.cwd(), 'drizzle'),
    path.resolve(process.cwd(), 'apps', 'api', 'drizzle'),
  ];
  const sqliteMigrationsFolder = sqliteCandidates.find(p => fs.existsSync(p)) || sqliteCandidates[0];

  try {
    migrate(db, { migrationsFolder: sqliteMigrationsFolder });
    console.log('SQLite migrations complete');
  } catch (error) {
    console.error('SQLite migration error:', error);
  }
}

// Rebuild the derived page_references index from canonical JSON blobs (idempotent).
try {
  const { backfillReferenceIndex } = await import('./services/reference-service.js');
  await backfillReferenceIndex();
} catch (error) {
  console.error('Reference index backfill error:', error);
}

// Initialize realtime broadcaster
const realtimeConfig = loadRealtimeConfig();
await initializeBroadcaster(realtimeConfig);

// Check for admin password reset via env var
await ensureAdminPasswordReset();

const fastify = Fastify({
  logger: true,
});

// Parse CORS origins from environment variable
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim().replace(/\/+$/, ''))
  : ['http://localhost:5173', 'http://localhost:3000'];

// Register CORS. MCP + OAuth discovery endpoints are called from arbitrary
// origins (MCP Inspector, OAuth clients), so they get a permissive policy;
// the app API keeps the fixed origin list.
const appCorsOptions = {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Id'],
  credentials: true,
  exposedHeaders: ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'],
};
const mcpCorsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id'],
  exposedHeaders: ['mcp-session-id', 'mcp-protocol-version', 'www-authenticate'],
};
await fastify.register(cors, () => (req: { url?: string }, callback: (err: Error | null, options: typeof appCorsOptions | typeof mcpCorsOptions) => void) => {
  const url = req.url ?? '';
  const isMcpPath = url.startsWith('/mcp') || url.startsWith('/.well-known/');
  callback(null, isMcpPath ? mcpCorsOptions : appCorsOptions);
});

// Register JWT plugin
const jwtSecret = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('JWT_SECRET environment variable is required in production'); })()
    : 'dev-secret-change-in-production'
);
await fastify.register(jwt, { secret: jwtSecret });

// Register rate limiting (after JWT, before routes)
await registerRateLimit(fastify);

// Populate request.clientId from X-Client-Id header for every request
fastify.addHook('onRequest', clientIdMiddleware);

// Request-scoped permission cache (AsyncLocalStorage) — the rest of the
// request lifecycle runs inside this context.
fastify.addHook('onRequest', (_request, _reply, done) => {
  runWithRequestContext(done);
});

// Register routes
await fastify.register(authRoutes);
await fastify.register(usersRoutes);
await fastify.register(pagesRoutes);
await fastify.register(blocksRoutes);
await fastify.register(sharesRoutes);
await fastify.register(databasesRoutes);
await fastify.register(filesRoutes);
await fastify.register(importRoutes);
await fastify.register(searchRoutes);
await fastify.register(realtimeRoutes);

// MCP server (read-only Model Context Protocol access) — zero overhead when disabled
if (isMcpEnabled()) {
  const { mcpSettingsRoutes } = await import('./routes/mcp-settings.js');
  const { mcpRoutes } = await import('./mcp/mcp-routes.js');
  const { mcpOAuthRoutes } = await import('./mcp/oauth/oauth-routes.js');
  await fastify.register(mcpSettingsRoutes);
  await fastify.register(mcpRoutes);
  await fastify.register(mcpOAuthRoutes);
}

// Health check (exempt from rate limiting)
fastify.get('/health', { config: { rateLimit: false } }, async () => {
  return { status: 'ok', storageType: getStorageType() };
});

// Start server
const port = parseInt(process.env.PORT || '3001', 10);

// Export fastify for Vercel
export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};

// Start server only if not in serverless environment
const start = async () => {
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  start();
}
