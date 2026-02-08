import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import path from 'path';
import { pagesRoutes } from './routes/pages.js';
import { blocksRoutes } from './routes/blocks.js';
import { authRoutes } from './routes/auth.js';
import { sharesRoutes } from './routes/shares.js';
import { usersRoutes } from './routes/users.js';
import { databasesRoutes } from './routes/databases.js';
import { initializeStorage, getStorageType, type StorageType } from './storage/storage-factory.js';

// Determine storage type from environment
const storageType: StorageType = (process.env.STORAGE_TYPE as StorageType) || 'json-sqlite';

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
  const pgMigrationsFolder = path.resolve(process.cwd(), 'drizzle-pg');

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
  const sqliteMigrationsFolder = path.resolve(process.cwd(), 'drizzle');

  try {
    migrate(db, { migrationsFolder: sqliteMigrationsFolder });
    console.log('SQLite migrations complete');
  } catch (error) {
    console.error('SQLite migration error:', error);
  }
}

const fastify = Fastify({
  logger: true,
});

// Parse CORS origins from environment variable
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim().replace(/\/+$/, ''))
  : ['http://localhost:5173', 'http://localhost:3000'];

// Register CORS
await fastify.register(cors, {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// Register JWT plugin
await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
});

// Register routes
await fastify.register(authRoutes);
await fastify.register(usersRoutes);
await fastify.register(pagesRoutes);
await fastify.register(blocksRoutes);
await fastify.register(sharesRoutes);
await fastify.register(databasesRoutes);

// Health check
fastify.get('/health', async () => {
  const fs = await import('fs');
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, 'drizzle-pg'),
    path.resolve(cwd, 'api', 'drizzle-pg'),
    path.resolve(cwd, '..', 'drizzle-pg'),
  ];
  const debug = {
    cwd,
    cwdContents: fs.existsSync(cwd) ? fs.readdirSync(cwd) : 'NOT_FOUND',
    migrationPaths: candidates.map(p => ({ path: p, exists: fs.existsSync(p) })),
  };
  return { status: 'ok', storageType: getStorageType(), debug };
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
