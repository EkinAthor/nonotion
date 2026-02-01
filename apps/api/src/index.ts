import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { pagesRoutes } from './routes/pages.js';
import { blocksRoutes } from './routes/blocks.js';
import { authRoutes } from './routes/auth.js';
import { sharesRoutes } from './routes/shares.js';
import { usersRoutes } from './routes/users.js';

// Run database migrations on startup
import { db } from './db/index.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../drizzle');

try {
  migrate(db, { migrationsFolder });
  console.log('Database migrations complete');
} catch (error) {
  console.error('Migration error:', error);
}

const fastify = Fastify({
  logger: true,
});

// Register CORS
await fastify.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('Server listening on http://localhost:3001');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
