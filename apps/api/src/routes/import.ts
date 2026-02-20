import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { importNotionExport } from '../services/import/import-service.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';

const MAX_IMPORT_SIZE_BYTES =
  (parseInt(process.env.MAX_IMPORT_SIZE_MB || '100', 10)) * 1024 * 1024;

export async function importRoutes(fastify: FastifyInstance): Promise<void> {
  // Register multipart scoped to this plugin
  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_IMPORT_SIZE_BYTES,
    },
  });

  // Add auth to all routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  // POST /api/import - Import a Notion export ZIP
  fastify.post('/api/import', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        success: false,
      });
    }

    // Validate file type
    const filename = data.filename.toLowerCase();
    if (!filename.endsWith('.zip')) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'File must be a ZIP archive' },
        success: false,
      });
    }

    const buffer = await data.toBuffer();

    try {
      const result = await importNotionExport(buffer, request.userId!);
      return reply.status(200).send({ data: result, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      return reply.status(500).send({
        error: { code: 'IMPORT_ERROR', message },
        success: false,
      });
    }
  });
}
