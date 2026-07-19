import type { McpDatabaseAccess, SetMcpAccessInput, Page } from '@nonotion/shared';
import { now } from '@nonotion/shared';
import { getStorage, getMcpStorage } from '../storage/storage-factory.js';
import * as permissionService from './permission-service.js';

export interface McpViewer {
  userId: string;
  isOwner: boolean;
}

/**
 * Set (or update) a user's MCP access grant for a database. The user must be
 * able to read the database — MCP access is always additive to canRead.
 */
export async function setAccess(
  viewer: McpViewer,
  databaseId: string,
  input: SetMcpAccessInput
): Promise<McpDatabaseAccess> {
  const page = await getStorage().getPage(databaseId);
  if (!page || page.type !== 'database') {
    throw new McpAccessError('NOT_FOUND', 'Database not found');
  }
  const readable = await permissionService.canRead(databaseId, viewer.userId, {
    isWorkspaceOwner: viewer.isOwner,
  });
  if (!readable) {
    throw new McpAccessError('FORBIDDEN', 'You do not have access to this database');
  }

  const existing = await getMcpStorage().getMcpDatabaseAccess(viewer.userId, databaseId);
  const timestamp = now();
  const access: McpDatabaseAccess = {
    userId: viewer.userId,
    databaseId,
    enabled: input.enabled,
    allowImages: input.allowImages ?? existing?.allowImages ?? false,
    allowFiles: input.allowFiles ?? existing?.allowFiles ?? false,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  return getMcpStorage().upsertMcpDatabaseAccess(access);
}

export async function getAccess(userId: string, databaseId: string): Promise<McpDatabaseAccess | null> {
  return getMcpStorage().getMcpDatabaseAccess(userId, databaseId);
}

export async function removeAccess(userId: string, databaseId: string): Promise<boolean> {
  return getMcpStorage().deleteMcpDatabaseAccess(userId, databaseId);
}

export async function listAccess(userId: string): Promise<McpDatabaseAccess[]> {
  return getMcpStorage().listMcpDatabaseAccess(userId);
}

/**
 * The user's effective MCP surface: enabled grants whose database still exists
 * and is still readable. Revoked shares drop out here automatically.
 */
export async function listAccessibleDatabases(
  viewer: McpViewer
): Promise<Array<{ access: McpDatabaseAccess; database: Page }>> {
  const grants = (await getMcpStorage().listMcpDatabaseAccess(viewer.userId)).filter((g) => g.enabled);
  if (grants.length === 0) return [];

  const pages = await getStorage().getPagesByIds(grants.map((g) => g.databaseId));
  const pageById = new Map(pages.map((p) => [p.id, p]));

  const result: Array<{ access: McpDatabaseAccess; database: Page }> = [];
  for (const access of grants) {
    const database = pageById.get(access.databaseId);
    if (!database || database.type !== 'database') continue;
    const readable = await permissionService.canRead(access.databaseId, viewer.userId, {
      isWorkspaceOwner: viewer.isOwner,
    });
    if (!readable) continue;
    result.push({ access, database });
  }
  return result;
}

/**
 * Effective MCP access check for one database: grant enabled AND still readable.
 * Returns the grant (for allowImages/allowFiles) or null.
 */
export async function getEffectiveAccess(
  viewer: McpViewer,
  databaseId: string
): Promise<McpDatabaseAccess | null> {
  const access = await getMcpStorage().getMcpDatabaseAccess(viewer.userId, databaseId);
  if (!access || !access.enabled) return null;
  const readable = await permissionService.canRead(databaseId, viewer.userId, {
    isWorkspaceOwner: viewer.isOwner,
  });
  return readable ? access : null;
}

export class McpAccessError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'FORBIDDEN',
    message: string
  ) {
    super(message);
    this.name = 'McpAccessError';
  }
}
