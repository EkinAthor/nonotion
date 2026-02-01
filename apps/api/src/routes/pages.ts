import type { FastifyInstance } from 'fastify';
import { createPageInputSchema, updatePageInputSchema } from '@nonotion/shared';
import * as pageService from '../services/page-service.js';
import * as permissionService from '../services/permission-service.js';
import { authMiddleware, mustChangePasswordMiddleware } from '../middleware/auth.js';

export async function pagesRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth and password change check to all routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);

  // GET /api/pages - List all pages user has access to
  fastify.get('/api/pages', async (request, reply) => {
    const pages = await permissionService.getUserAccessiblePages(request.userId!);
    return reply.send({ data: pages, success: true });
  });

  // GET /api/pages/:id - Get page by ID
  fastify.get<{ Params: { id: string } }>('/api/pages/:id', async (request, reply) => {
    const canRead = await permissionService.canRead(request.params.id, request.userId!);
    if (!canRead) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Page not found' },
        success: false,
      });
    }

    const page = await pageService.getPage(request.params.id);
    if (!page) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Page not found' },
        success: false,
      });
    }
    return reply.send({ data: page, success: true });
  });

  // GET /api/pages/:id/permission - Get user's permission level for a page
  fastify.get<{ Params: { id: string } }>('/api/pages/:id/permission', async (request, reply) => {
    const permission = await permissionService.getEffectivePermission(request.params.id, request.userId!);
    if (!permission) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Page not found' },
        success: false,
      });
    }
    return reply.send({ data: { level: permission }, success: true });
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

    // If creating under a parent, check permission
    if (parsed.data.parentId) {
      const canEdit = await permissionService.canEdit(parsed.data.parentId, request.userId!);
      if (!canEdit) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'You do not have permission to create pages under this parent' },
          success: false,
        });
      }
    }

    const page = await pageService.createPage(parsed.data, request.userId!);

    // Create owner permission for the new page
    await permissionService.createOwnerPermission(page.id, request.userId!);

    // If page has a parent, inherit its permissions (for shared access)
    if (parsed.data.parentId) {
      await permissionService.inheritParentPermissions(page.id, parsed.data.parentId);
    }

    return reply.status(201).send({ data: page, success: true });
  });

  // PATCH /api/pages/:id - Update page
  fastify.patch<{ Params: { id: string } }>('/api/pages/:id', async (request, reply) => {
    const canEdit = await permissionService.canEdit(request.params.id, request.userId!);
    if (!canEdit) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this page' },
        success: false,
      });
    }

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
    const canDelete = await permissionService.canDelete(request.params.id, request.userId!);
    if (!canDelete) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to delete this page' },
        success: false,
      });
    }

    // Delete permissions first
    await permissionService.deletePagePermissions(request.params.id);

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
