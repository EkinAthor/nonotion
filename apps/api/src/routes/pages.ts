import type { FastifyInstance } from 'fastify';
import { createPageInputSchema, updatePageInputSchema } from '@nonotion/shared';
import * as pageService from '../services/page-service.js';

export async function pagesRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/pages - List all pages
  fastify.get('/api/pages', async (_request, reply) => {
    const pages = await pageService.getAllPages();
    return reply.send({ data: pages, success: true });
  });

  // GET /api/pages/:id - Get page by ID
  fastify.get<{ Params: { id: string } }>('/api/pages/:id', async (request, reply) => {
    const page = await pageService.getPage(request.params.id);
    if (!page) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Page not found' },
        success: false,
      });
    }
    return reply.send({ data: page, success: true });
  });

  // POST /api/pages - Create page
  fastify.post('/api/pages', async (request, reply) => {
    const parsed = createPageInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    const page = await pageService.createPage(parsed.data);
    return reply.status(201).send({ data: page, success: true });
  });

  // PATCH /api/pages/:id - Update page
  fastify.patch<{ Params: { id: string } }>('/api/pages/:id', async (request, reply) => {
    const parsed = updatePageInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    const page = await pageService.updatePage(request.params.id, parsed.data);
    if (!page) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Page not found' },
        success: false,
      });
    }
    return reply.send({ data: page, success: true });
  });

  // DELETE /api/pages/:id - Delete page
  fastify.delete<{ Params: { id: string } }>('/api/pages/:id', async (request, reply) => {
    const success = await pageService.deletePage(request.params.id);
    if (!success) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Page not found' },
        success: false,
      });
    }
    return reply.status(204).send();
  });
}
