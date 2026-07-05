import type { FastifyInstance } from 'fastify';
import { createPageInputSchema, updatePageInputSchema, updateSchemaInputSchema, updatePropertiesInputSchema, updatePageOrderInputSchema } from '@nonotion/shared';
import * as pageService from '../services/page-service.js';
import * as databaseService from '../services/database-service.js';
import * as permissionService from '../services/permission-service.js';
import { getBroadcaster } from '../realtime/realtime-factory.js';
import { authMiddleware, mustChangePasswordMiddleware, approvedUserMiddleware } from '../middleware/auth.js';

export async function pagesRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth, password change check, and approval check to all routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', mustChangePasswordMiddleware);
  fastify.addHook('preHandler', approvedUserMiddleware);

  // GET /api/pages - List all pages user has access to
  fastify.get('/api/pages', async (request, reply) => {
    const pages = await permissionService.getUserAccessiblePages(request.userId!, { isWorkspaceOwner: request.isOwner });
    return reply.send({ data: pages, success: true });
  });

  // GET /api/pages/order - Get page order settings
  fastify.get('/api/pages/order', async (_request, reply) => {
    const order = await pageService.getPageOrder();
    return reply.send({ data: order, success: true });
  });

  // PATCH /api/pages/order - Update page order
  fastify.patch('/api/pages/order', async (request, reply) => {
    const parsed = updatePageOrderInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    const order = await pageService.updatePageOrder(parsed.data);
    return reply.send({ data: order, success: true });
  });

  // GET /api/pages/:id - Get page by ID
  fastify.get<{ Params: { id: string } }>('/api/pages/:id', async (request, reply) => {
    const canRead = await permissionService.canRead(request.params.id, request.userId!, { isWorkspaceOwner: request.isOwner });
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
    // Workspace owners have full access to all pages
    if (request.isOwner === true) {
      return reply.send({ data: { level: 'owner' }, success: true });
    }
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
      const canEdit = await permissionService.canEdit(parsed.data.parentId, request.userId!, { isWorkspaceOwner: request.isOwner });
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
    const canEdit = await permissionService.canEdit(request.params.id, request.userId!, { isWorkspaceOwner: request.isOwner });
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
    const canDelete = await permissionService.canDelete(request.params.id, request.userId!, { isWorkspaceOwner: request.isOwner });
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

  // PATCH /api/pages/:id/schema - Update database schema
  fastify.patch<{ Params: { id: string } }>('/api/pages/:id/schema', async (request, reply) => {
    const canEdit = await permissionService.canEdit(request.params.id, request.userId!, { isWorkspaceOwner: request.isOwner });
    if (!canEdit) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this database' },
        success: false,
      });
    }

    const parsed = updateSchemaInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    const page = await databaseService.updateSchema(request.params.id, parsed.data);
    if (!page) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Database not found' },
        success: false,
      });
    }
    getBroadcaster().broadcastToDatabase(request.params.id, 'schema_update', {
      databaseId: request.params.id, schema: page.databaseSchema, userId: request.userId, clientId: request.clientId,
    }).catch(err => fastify.log.warn(err, 'Failed to broadcast schema_update'));
    return reply.send({ data: page, success: true });
  });

  // PATCH /api/pages/:id/properties - Update row property values
  fastify.patch<{ Params: { id: string } }>('/api/pages/:id/properties', async (request, reply) => {
    const canEdit = await permissionService.canEdit(request.params.id, request.userId!, { isWorkspaceOwner: request.isOwner });
    if (!canEdit) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this page' },
        success: false,
      });
    }

    const parsed = updatePropertiesInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        success: false,
      });
    }

    const page = await databaseService.updateRowProperties(request.params.id, parsed.data.properties);
    if (!page) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Page not found' },
        success: false,
      });
    }
    if (page.parentId) {
      getBroadcaster().broadcastToDatabase(page.parentId, 'row_update', {
        rowId: request.params.id, databaseId: page.parentId,
        properties: parsed.data.properties, title: page.title,
        userId: request.userId, clientId: request.clientId,
      }).catch(err => fastify.log.warn(err, 'Failed to broadcast row_update'));
    }
    return reply.send({ data: page, success: true });
  });
}
