import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { attachmentInitiateInputSchema, fileDownloadDispositionSchema } from '@nonotion/shared';
import * as attachmentService from '../services/attachment-service.js';
import { AttachmentError, isSafeInlineMime } from '../services/attachment-service.js';
import { loadFileAttachmentsConfig } from '../config/files.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';
import { contentDisposition } from '../utils/http.js';

function statusForError(code: AttachmentError['code']): number {
  switch (code) {
    case 'FORBIDDEN': return 403;
    case 'NOT_FOUND': return 404;
    case 'CONFLICT': return 409;
    default: return 400;
  }
}

function sendAttachmentError(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof AttachmentError) {
    return reply.status(statusForError(error.code)).send({
      success: false,
      error: { code: error.code === 'VALIDATION' ? 'VALIDATION_ERROR' : error.code, message: error.message },
    });
  }
  const message = error instanceof Error ? error.message : 'Attachment operation failed';
  return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message } });
}

export async function attachmentsRoutes(fastify: FastifyInstance): Promise<void> {
  const config = loadFileAttachmentsConfig();
  const uploadRateLimit = () => ({
    rateLimit: fastify.rateLimitEnabled
      ? { max: fastify.rateLimitConfig.upload.max, timeWindow: fastify.rateLimitConfig.upload.timeWindow }
      : false as const,
  });

  // ─── Authed scope ─────────────────────────────────────────────────────────
  await fastify.register(async (authed) => {
    await authed.register(multipart, {
      limits: { fileSize: config.maxSizeMb * 1024 * 1024 },
    });
    authed.addHook('preHandler', authMiddleware);
    authed.addHook('preHandler', mustChangePasswordMiddleware);
    authed.addHook('preHandler', approvedUserMiddleware);

    // POST /api/files/attachments/initiate — validate, permission-check, create pending row
    authed.post('/api/files/attachments/initiate', { config: uploadRateLimit() }, async (request, reply) => {
      const parsed = attachmentInitiateInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        });
      }
      try {
        const result = await attachmentService.initiateUpload(parsed.data, {
          userId: request.userId!,
          isOwner: request.isOwner === true,
        });
        return reply.status(201).send({ success: true, data: result });
      } catch (error) {
        return sendAttachmentError(reply, error);
      }
    });

    // POST /api/files/attachments/:id/content — db-backend direct upload (multipart, terminal)
    authed.post<{ Params: { id: string } }>(
      '/api/files/attachments/:id/content',
      { config: uploadRateLimit() },
      async (request, reply) => {
        const data = await request.file();
        if (!data) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
          });
        }
        try {
          const buffer = await data.toBuffer();
          const result = await attachmentService.storeDirectUpload(request.params.id, buffer, request.userId!);
          return reply.status(201).send({ success: true, data: result });
        } catch (error) {
          return sendAttachmentError(reply, error);
        }
      }
    );

    // POST /api/files/attachments/:id/confirm — supabase-backend upload verification
    authed.post<{ Params: { id: string } }>(
      '/api/files/attachments/:id/confirm',
      { config: uploadRateLimit() },
      async (request, reply) => {
        try {
          const result = await attachmentService.confirmUpload(request.params.id, request.userId!);
          return reply.status(200).send({ success: true, data: result });
        } catch (error) {
          return sendAttachmentError(reply, error);
        }
      }
    );

    // GET /api/files/:id/download-url — permission-checked, returns a short-lived URL
    authed.get<{ Params: { id: string }; Querystring: { disposition?: string } }>(
      '/api/files/:id/download-url',
      async (request, reply) => {
        const dispositionParsed = fileDownloadDispositionSchema.safeParse(request.query.disposition ?? 'attachment');
        const disposition = dispositionParsed.success ? dispositionParsed.data : 'attachment';
        try {
          const { meta, backendUrl, disposition: effective } = await attachmentService.issueDownloadUrl(
            request.params.id,
            { userId: request.userId!, isOwner: request.isOwner === true },
            disposition
          );
          if (backendUrl) {
            return reply.send({ success: true, data: backendUrl });
          }
          // db backend: issue a short-lived download token consumed by the public route below.
          const ttl = config.signedUrlTtlSeconds;
          const token = fastify.jwt.sign(
            { fileId: meta.id, disposition: effective, aud: 'file-download' as const },
            { expiresIn: ttl }
          );
          return reply.send({
            success: true,
            data: {
              url: `/api/files/${meta.id}/download?token=${encodeURIComponent(token)}`,
              expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
            },
          });
        } catch (error) {
          return sendAttachmentError(reply, error);
        }
      }
    );
  });

  // ─── Public scope (token-authorized; browser navigation can't send Bearer) ─
  fastify.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/api/files/:id/download',
    async (request, reply) => {
      const { token } = request.query;
      if (!token) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing download token' },
        });
      }
      let claims: { fileId?: string; disposition?: string; aud?: string };
      try {
        claims = fastify.jwt.verify(token);
      } catch {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired download token' },
        });
      }
      if (claims.aud !== 'file-download' || claims.fileId !== request.params.id) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid download token' },
        });
      }

      const file = await attachmentService.getAttachmentData(request.params.id);
      if (!file) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' },
        });
      }

      const disposition =
        claims.disposition === 'inline' && isSafeInlineMime(file.meta.mimeType) ? 'inline' : 'attachment';
      return reply
        .header('Content-Type', file.meta.mimeType)
        .header('Content-Length', file.data.length)
        .header('Content-Disposition', contentDisposition(disposition, file.meta.filename))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'private, no-store')
        .send(file.data);
    }
  );
}
