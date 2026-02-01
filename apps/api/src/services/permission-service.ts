import type { Page, PagePermission, PermissionLevel } from '@nonotion/shared';
import { now } from '@nonotion/shared';
import { userStorage } from '../storage/sqlite-storage.js';
import { storage } from '../storage/json-storage.js';

export async function getEffectivePermission(
  pageId: string,
  userId: string
): Promise<PermissionLevel | null> {
  // First check direct permission on this page
  const permission = await userStorage.getPermission(pageId, userId);
  if (permission) {
    return permission.level;
  }

  // Check inherited permission from parent pages
  const page = await storage.getPage(pageId);
  if (page?.parentId) {
    return getEffectivePermission(page.parentId, userId);
  }

  return null;
}

export async function canRead(pageId: string, userId: string): Promise<boolean> {
  const permission = await getEffectivePermission(pageId, userId);
  return permission !== null; // viewer, editor, or owner can read
}

export async function canEdit(pageId: string, userId: string): Promise<boolean> {
  const permission = await getEffectivePermission(pageId, userId);
  return permission === 'editor' || permission === 'full_access' || permission === 'owner';
}

export async function canShare(pageId: string, userId: string): Promise<boolean> {
  const permission = await getEffectivePermission(pageId, userId);
  return permission === 'full_access' || permission === 'owner';
}

export async function canDelete(pageId: string, userId: string): Promise<boolean> {
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
  return userStorage.createPermission(permission);
}

// Get all descendant page IDs recursively
async function getDescendantPageIds(pageId: string): Promise<string[]> {
  const page = await storage.getPage(pageId);
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

  // Share the main page
  const mainPermission = await sharePageDirect(pageId, targetUserId, level, grantedBy, timestamp);

  // Also share/update all descendant pages (unless they have owner permission)
  const descendantIds = await getDescendantPageIds(pageId);
  for (const descendantId of descendantIds) {
    // Check if descendant has an explicit permission for this user
    const existingPermission = await userStorage.getPermission(descendantId, targetUserId);
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
  const existing = await userStorage.getPermission(pageId, targetUserId);

  if (existing) {
    // Update existing permission
    const updated = await userStorage.updatePermission(pageId, targetUserId, {
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
  return userStorage.createPermission(permission);
}

export async function unshare(pageId: string, userId: string): Promise<boolean> {
  // Don't allow unsharing owner
  const permission = await userStorage.getPermission(pageId, userId);
  if (permission?.level === 'owner') {
    throw new Error('Cannot remove owner permission');
  }

  // Unshare from this page
  const result = await userStorage.deletePermission(pageId, userId);

  // Also remove from all descendants (unless they have owner permission there)
  const descendantIds = await getDescendantPageIds(pageId);
  for (const descendantId of descendantIds) {
    const descendantPermission = await userStorage.getPermission(descendantId, userId);
    if (descendantPermission && descendantPermission.level !== 'owner') {
      await userStorage.deletePermission(descendantId, userId);
    }
  }

  return result;
}

export async function getPagePermissions(pageId: string): Promise<PagePermission[]> {
  return userStorage.getPagePermissions(pageId);
}

export async function deletePagePermissions(pageId: string): Promise<void> {
  return userStorage.deletePagePermissions(pageId);
}

export async function getUserAccessiblePages(userId: string): Promise<Page[]> {
  // Get all permissions for this user
  const permissions = await userStorage.getUserPermissions(userId);
  const pageIds = new Set(permissions.map((p) => p.pageId));

  // Get all pages and filter to accessible ones
  const allPages = await storage.getAllPages();

  // A page is accessible if user has direct permission OR if any ancestor has permission
  const accessiblePages: Page[] = [];

  for (const page of allPages) {
    // Check direct permission first
    if (pageIds.has(page.id)) {
      accessiblePages.push(page);
      continue;
    }

    // Check if any ancestor has permission (inherited access)
    let currentParentId = page.parentId;
    while (currentParentId) {
      if (pageIds.has(currentParentId)) {
        accessiblePages.push(page);
        break;
      }
      const parent = allPages.find(p => p.id === currentParentId);
      currentParentId = parent?.parentId ?? null;
    }
  }

  return accessiblePages;
}

// Copy permissions from parent page to child page (for newly created pages)
export async function inheritParentPermissions(childPageId: string, parentPageId: string): Promise<void> {
  const parentPermissions = await userStorage.getPagePermissions(parentPageId);
  const timestamp = now();

  for (const parentPerm of parentPermissions) {
    // Skip owner - child gets its own owner
    if (parentPerm.level === 'owner') continue;

    // Create the same permission for child
    const exists = await userStorage.getPermission(childPageId, parentPerm.userId);
    if (!exists) {
      await userStorage.createPermission({
        pageId: childPageId,
        userId: parentPerm.userId,
        level: parentPerm.level,
        grantedBy: parentPerm.grantedBy,
        grantedAt: timestamp,
      });
    }
  }
}
