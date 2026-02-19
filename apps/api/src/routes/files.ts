import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import * as fileService from '../services/file-service.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';

const MAX_FILE_SIZE_BYTES =
  (parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10)) * 1024 * 1024;

export async function filesRoutes(fastify: FastifyInstance): Promise<void> {
  // Register multipart scoped to this plugin
  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
    },
  });

  // Add auth to all routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  // POST /api/files - Upload a file
  fastify.post('/api/files', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        success: false,
      });
    }

    const buffer = await data.toBuffer();
    const filename = data.filename;
    const mimeType = data.mimetype;

    try {
      const result = await fileService.uploadFile(
        buffer,
        filename,
        mimeType,
        request.userId!
      );
      return reply.status(201).send({ data: result, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      return reply.status(400).send({
        error: { code: 'UPLOAD_ERROR', message },
        success: false,
      });
    }
  });

  // GET /api/files/:id - Get a file
  fastify.get<{ Params: { id: string } }>('/api/files/:id', async (request, reply) => {
    const file = await fileService.getFile(request.params.id);
    if (!file) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'File not found' },
        success: false,
      });
    }

    return reply
      .header('Content-Type', file.meta.mimeType)
      .header('Content-Length', file.meta.size)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(file.data);
  });
}
