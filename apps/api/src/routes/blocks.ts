import type { FastifyInstance } from 'fastify';
import { createBlockInputSchema, updateBlockInputSchema, reorderBlocksInputSchema } from '@nonotion/shared';
import * as blockService from '../services/block-service.js';

export async function blocksRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/pages/:pageId/blocks - Get blocks for page
  fastify.get<{ Params: { pageId: string } }>('/api/pages/:pageId/blocks', async (request, reply) => {
    const blocks = await blockService.getBlocksByPage(request.params.pageId);
    return reply.send({ data: blocks, success: true });
  });

  // POST /api/pages/:pageId/blocks - Create block
  fastify.post<{ Params: { pageId: string } }>('/api/pages/:pageId/blocks', async (request, reply) => {
    const body = { ...(request.body as object), pageId: request.params.pageId };
    const parsed = createBlockInputSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    const block = await blockService.createBlock(parsed.data);
    return reply.status(201).send({ data: block, success: true });
  });

  // PATCH /api/blocks/:id - Update block
  fastify.patch<{ Params: { id: string } }>('/api/blocks/:id', async (request, reply) => {
    const parsed = updateBlockInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    const block = await blockService.updateBlock(request.params.id, parsed.data);
    if (!block) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Block not found' },
        success: false,
      });
    }
    return reply.send({ data: block, success: true });
  });

  // DELETE /api/blocks/:id - Delete block
  fastify.delete<{ Params: { id: string } }>('/api/blocks/:id', async (request, reply) => {
    const success = await blockService.deleteBlock(request.params.id);
    if (!success) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Block not found' },
        success: false,
      });
    }
    return reply.status(204).send();
  });

  // PATCH /api/pages/:pageId/blocks/reorder - Reorder blocks
  fastify.patch<{ Params: { pageId: string } }>('/api/pages/:pageId/blocks/reorder', async (request, reply) => {
    const parsed = reorderBlocksInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    try {
      const blocks = await blockService.reorderBlocks(request.params.pageId, parsed.data);
      return reply.send({ data: blocks, success: true });
    } catch (error) {
      return reply.status(400).send({
        error: { code: 'INVALID_OPERATION', message: (error as Error).message },
        success: false,
      });
    }
  });
}
