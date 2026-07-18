import type { Page, PagePermission, PermissionLevel } from '@nonotion/shared';
import { now } from '@nonotion/shared';
import { getStorage, getUserStorage } from '../storage/storage-factory.js';
import { getPermissionCache, clearPermissionCache, type PermissionCache } from './request-context.js';

export async function getEffectivePermission(
  pageId: string,
  userId: string
): Promise<PermissionLevel | null> {
  const cache = getPermissionCache();
  const key = `${pageId}:${userId}`;
  const cached = cache?.get(key);
  if (cached !== undefined) return cached;

  const userStorage = getUserStorage();
  const level = userStorage.findNearestPermission
    ? // Single-query nearest-ancestor lookup (recursive CTE)
      await userStorage.findNearestPermission(pageId, userId)
    : await walkEffectivePermission(pageId, userId, cache);

  cache?.set(key, level);
  return level;
}

/** Per-level walk fallback for backends without findNearestPermission. */
async function walkEffectivePermission(
  pageId: string,
  userId: string,
  cache: PermissionCache | undefined
): Promise<PermissionLevel | null> {
  const key = `${pageId}:${userId}`;
  const cached = cache?.get(key);
  if (cached !== undefined) return cached;

  // First check direct permission on this page
  const permission = await getUserStorage().getPermission(pageId, userId);
  let level: PermissionLevel | null = null;
  if (permission) {
    level = permission.level;
  } else {
    // Check inherited permission from parent pages
    const page = await getStorage().getPage(pageId);
    if (page?.parentId) {
      level = await walkEffectivePermission(page.parentId, userId, cache);
    }
  }

  cache?.set(key, level);
  return level;
}

export interface PermissionOptions {
  isWorkspaceOwner?: boolean;
}

export async function canRead(pageId: string, userId: string, options?: PermissionOptions): Promise<boolean> {
  if (options?.isWorkspaceOwner === true) return true;
  const permission = await getEffectivePermission(pageId, userId);
  return permission !== null; // viewer, editor, or owner can read
}

export async function canEdit(pageId: string, userId: string, options?: PermissionOptions): Promise<boolean> {
  if (options?.isWorkspaceOwner === true) return true;
  const permission = await getEffectivePermission(pageId, userId);
  return permission === 'editor' || permission === 'full_access' || permission === 'owner';
}

export async function canShare(pageId: string, userId: string, options?: PermissionOptions): Promise<boolean> {
  if (options?.isWorkspaceOwner === true) return true;
  const permission = await getEffectivePermission(pageId, userId);
  return permission === 'full_access' || permission === 'owner';
}

export async function canDelete(pageId: string, userId: string, options?: PermissionOptions): Promise<boolean> {
  if (options?.isWorkspaceOwner === true) return true;
  const permission = await getEffectivePermission(pageId, userId);
  return permission === 'owner';
}

export async function createOwnerPermission(pageId: string, userId: string): Promise<PagePermission> {
  const timestamp = now();
  const permission: PagePermission = {
    pageId,
    userId,
    level: 'owner',
    grantedBy: userId,
    grantedAt: timestamp,
  };
  clearPermissionCache();
  return getUserStorage().createPermission(permission);
}

// Get all descendant page IDs recursively
async function getDescendantPageIds(pageId: string): Promise<string[]> {
  const page = await getStorage().getPage(pageId);
  if (!page || page.childIds.length === 0) {
    return [];
  }

  const descendants: string[] = [...page.childIds];
  for (const childId of page.childIds) {
    const childDescendants = await getDescendantPageIds(childId);
    descendants.push(...childDescendants);
  }

  return descendants;
}

export async function sharePage(
  pageId: string,
  targetUserId: string,
  level: PermissionLevel,
  grantedBy: string
): Promise<PagePermission> {
  if (level === 'owner') {
    throw new Error('Cannot share with owner permission');
  }

  const timestamp = now();
  clearPermissionCache();

  // Share the main page
  const mainPermission = await sharePageDirect(pageId, targetUserId, level, grantedBy, timestamp);

  // Also share/update all descendant pages (unless they have owner permission)
  const descendantIds = await getDescendantPageIds(pageId);
  for (const descendantId of descendantIds) {
    // Check if descendant has an explicit permission for this user
    const existingPermission = await getUserStorage().getPermission(descendantId, targetUserId);
    if (!existingPermission) {
      // No existing permission - create one
      await sharePageDirect(descendantId, targetUserId, level, grantedBy, timestamp);
    } else if (existingPermission.level !== 'owner') {
      // Has existing non-owner permission - update it to match parent
      await sharePageDirect(descendantId, targetUserId, level, grantedBy, timestamp);
    }
    // If they have owner permission on descendant, don't touch it
  }

  return mainPermission;
}

async function sharePageDirect(
  pageId: string,
  targetUserId: string,
  level: PermissionLevel,
  grantedBy: string,
  timestamp: string
): Promise<PagePermission> {
  // Check if permission already exists
  const existing = await getUserStorage().getPermission(pageId, targetUserId);

  if (existing) {
    // Update existing permission
    const updated = await getUserStorage().updatePermission(pageId, targetUserId, {
      level,
      grantedBy,
      grantedAt: timestamp,
    });
    if (!updated) {
      throw new Error('Failed to update permission');
    }
    return updated;
  }

  // Create new permission
  const permission: PagePermission = {
    pageId,
    userId: targetUserId,
    level,
    grantedBy,
    grantedAt: timestamp,
  };
  return getUserStorage().createPermission(permission);
}

export async function unshare(pageId: string, userId: string): Promise<boolean> {
  // Don't allow unsharing owner
  const permission = await getUserStorage().getPermission(pageId, userId);
  if (permission?.level === 'owner') {
    throw new Error('Cannot remove owner permission');
  }

  // Unshare from this page
  clearPermissionCache();
  const result = await getUserStorage().deletePermission(pageId, userId);

  // Also remove from all descendants (unless they have owner permission there)
  const descendantIds = await getDescendantPageIds(pageId);
  for (const descendantId of descendantIds) {
    const descendantPermission = await getUserStorage().getPermission(descendantId, userId);
    if (descendantPermission && descendantPermission.level !== 'owner') {
      await getUserStorage().deletePermission(descendantId, userId);
    }
  }

  return result;
}

export async function getPagePermissions(pageId: string): Promise<PagePermission[]> {
  return getUserStorage().getPagePermissions(pageId);
}

export async function deletePagePermissions(pageId: string): Promise<void> {
  clearPermissionCache();
  return getUserStorage().deletePagePermissions(pageId);
}

export async function getUserAccessiblePages(userId: string, options?: PermissionOptions): Promise<Page[]> {
  // Workspace owners can access all pages
  if (options?.isWorkspaceOwner === true) {
    return getStorage().getAllPages();
  }

  // Get all permissions for this user
  const permissions = await getUserStorage().getUserPermissions(userId);
  const pageIds = new Set(permissions.map((p) => p.pageId));

  // Get all pages and filter to accessible ones
  const allPages = await getStorage().getAllPages();
  const pagesById = new Map(allPages.map((p) => [p.id, p]));

  // A page is accessible if user has direct permission OR if any ancestor has
  // permission. Memoize per-node accessibility so shared ancestor chains are
  // walked once.
  const accessible = new Map<string, boolean>();
  const isAccessible = (pageId: string): boolean => {
    const cached = accessible.get(pageId);
    if (cached !== undefined) return cached;
    // Walk up until a permission, a memoized answer, or the root.
    const chain: string[] = [];
    let currentId: string | null = pageId;
    let result = false;
    while (currentId) {
      const memo = accessible.get(currentId);
      if (memo !== undefined) {
        result = memo;
        break;
      }
      if (pageIds.has(currentId)) {
        result = true;
        break;
      }
      chain.push(currentId);
      currentId = pagesById.get(currentId)?.parentId ?? null;
    }
    for (const id of chain) accessible.set(id, result);
    return result;
  };

  return allPages.filter((page) => isAccessible(page.id));
}

// Copy permissions from parent page to child page (for newly created pages)
export async function inheritParentPermissions(childPageId: string, parentPageId: string): Promise<void> {
  const parentPermissions = await getUserStorage().getPagePermissions(parentPageId);
  const timestamp = now();
  clearPermissionCache();

  for (const parentPerm of parentPermissions) {
    // Skip owner - child gets its own owner
    if (parentPerm.level === 'owner') continue;

    // Create the same permission for child
    const exists = await getUserStorage().getPermission(childPageId, parentPerm.userId);
    if (!exists) {
      await getUserStorage().createPermission({
        pageId: childPageId,
        userId: parentPerm.userId,
        level: parentPerm.level,
        grantedBy: parentPerm.grantedBy,
        grantedAt: timestamp,
      });
    }
  }
}
