import type { FastifyInstance } from 'fastify';
import { createBlockInputSchema, updateBlockInputSchema, reorderBlocksInputSchema } from '@nonotion/shared';
import * as blockService from '../services/block-service.js';
import * as permissionService from '../services/permission-service.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';
import { getBroadcaster } from '../realtime/realtime-factory.js';

export async function blocksRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth, password change check, and approval check to all routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  // GET /api/pages/:pageId/blocks - Get blocks for page
  fastify.get<{ Params: { pageId: string } }>('/api/pages/:pageId/blocks', async (request, reply) => {
    const canRead = await permissionService.canRead(request.params.pageId, request.userId!, { isWorkspaceOwner: request.isOwner });
    if (!canRead) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Page not found' },
        success: false,
      });
    }

    const blocks = await blockService.getBlocksByPage(request.params.pageId);
    return reply.send({ data: blocks, success: true });
  });

  // POST /api/pages/:pageId/blocks - Create block
  fastify.post<{ Params: { pageId: string } }>('/api/pages/:pageId/blocks', async (request, reply) => {
    const canEdit = await permissionService.canEdit(request.params.pageId, request.userId!, { isWorkspaceOwner: request.isOwner });
    if (!canEdit) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this page' },
        success: false,
      });
    }

    const body = { ...(request.body as object), pageId: request.params.pageId };
    const parsed = createBlockInputSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    const block = await blockService.createBlock(parsed.data);
    getBroadcaster().broadcastToPage(request.params.pageId, 'block_create', {
      block, pageId: request.params.pageId, userId: request.userId, clientId: request.clientId,
    }).catch(err => fastify.log.warn(err, 'Failed to broadcast block_create'));
    return reply.status(201).send({ data: block, success: true });
  });

  // PATCH /api/blocks/:id - Update block
  fastify.patch<{ Params: { id: string } }>('/api/blocks/:id', async (request, reply) => {
    // Get block to find pageId for permission check
    const existingBlock = await blockService.getBlock(request.params.id);
    if (!existingBlock) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Block not found' },
        success: false,
      });
    }

    const canEdit = await permissionService.canEdit(existingBlock.pageId, request.userId!, { isWorkspaceOwner: request.isOwner });
    if (!canEdit) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this page' },
        success: false,
      });
    }

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
    getBroadcaster().broadcastToPage(existingBlock.pageId, 'block_update', {
      blockId: request.params.id, block, pageId: existingBlock.pageId, userId: request.userId, clientId: request.clientId,
    }).catch(err => fastify.log.warn(err, 'Failed to broadcast block_update'));
    return reply.send({ data: block, success: true });
  });

  // DELETE /api/blocks/:id - Delete block
  fastify.delete<{ Params: { id: string } }>('/api/blocks/:id', async (request, reply) => {
    // Get block to find pageId for permission check
    const existingBlock = await blockService.getBlock(request.params.id);
    if (!existingBlock) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Block not found' },
        success: false,
      });
    }

    const canEdit = await permissionService.canEdit(existingBlock.pageId, request.userId!, { isWorkspaceOwner: request.isOwner });
    if (!canEdit) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this page' },
        success: false,
      });
    }

    const success = await blockService.deleteBlock(request.params.id);
    if (!success) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Block not found' },
        success: false,
      });
    }
    getBroadcaster().broadcastToPage(existingBlock.pageId, 'block_delete', {
      blockId: request.params.id, pageId: existingBlock.pageId, userId: request.userId, clientId: request.clientId,
    }).catch(err => fastify.log.warn(err, 'Failed to broadcast block_delete'));
    return reply.status(204).send();
  });

  // PATCH /api/pages/:pageId/blocks/reorder - Reorder blocks
  fastify.patch<{ Params: { pageId: string } }>('/api/pages/:pageId/blocks/reorder', async (request, reply) => {
    const canEdit = await permissionService.canEdit(request.params.pageId, request.userId!, { isWorkspaceOwner: request.isOwner });
    if (!canEdit) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this page' },
        success: false,
      });
    }

    const parsed = reorderBlocksInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    try {
      const blocks = await blockService.reorderBlocks(request.params.pageId, parsed.data);
      getBroadcaster().broadcastToPage(request.params.pageId, 'block_reorder', {
        pageId: request.params.pageId, blocks, userId: request.userId, clientId: request.clientId,
      }).catch(err => fastify.log.warn(err, 'Failed to broadcast block_reorder'));
      return reply.send({ data: blocks, success: true });
    } catch (error) {
      return reply.status(400).send({
        error: { code: 'INVALID_OPERATION', message: (error as Error).message },
        success: false,
      });
    }
  });
}
