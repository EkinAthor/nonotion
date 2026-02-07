import type { Page, CreatePageInput, UpdatePageInput } from '@nonotion/shared';
import { generatePageId, now } from '@nonotion/shared';
import { getStorage } from '../storage/storage-factory.js';
import { createDefaultSchema } from './database-service.js';

export async function getAllPages(): Promise<Page[]> {
  return getStorage().getAllPages();
}

export async function getPage(id: string): Promise<Page | null> {
  return getStorage().getPage(id);
}

export async function createPage(input: CreatePageInput, ownerId: string): Promise<Page> {
  const timestamp = now();
  const pageType = input.type ?? 'document';

  const page: Page = {
    id: generatePageId(),
    title: input.title,
    type: pageType,
    ownerId,
    parentId: input.parentId ?? null,
    childIds: [],
    icon: input.icon ?? null,
    isStarred: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  };

  // Add database schema for database pages
  if (pageType === 'database') {
    page.databaseSchema = input.databaseSchema ?? createDefaultSchema();
  }

  // Add properties for row pages (pages that are children of databases)
  if (input.properties) {
    page.properties = input.properties;
  }

  // If page has a parent, add it to parent's childIds
  if (page.parentId) {
    const parent = await getStorage().getPage(page.parentId);
    if (parent) {
      await getStorage().updatePage(page.parentId, {
        childIds: [...parent.childIds, page.id],
        updatedAt: timestamp,
        version: parent.version + 1,
      });
    }
  }

  return getStorage().createPage(page);
}

export async function updatePage(id: string, input: UpdatePageInput): Promise<Page | null> {
  const existing = await getStorage().getPage(id);
  if (!existing) return null;

  const timestamp = now();

  // Handle parent change
  if (input.parentId !== undefined && input.parentId !== existing.parentId) {
    // Remove from old parent
    if (existing.parentId) {
      const oldParent = await getStorage().getPage(existing.parentId);
      if (oldParent) {
        await getStorage().updatePage(existing.parentId, {
          childIds: oldParent.childIds.filter((cid: string) => cid !== id),
          updatedAt: timestamp,
          version: oldParent.version + 1,
        });
      }
    }

    // Add to new parent
    if (input.parentId) {
      const newParent = await getStorage().getPage(input.parentId);
      if (newParent) {
        await getStorage().updatePage(input.parentId, {
          childIds: [...newParent.childIds, id],
          updatedAt: timestamp,
          version: newParent.version + 1,
        });
      }
    }
  }

  return getStorage().updatePage(id, {
    ...input,
    updatedAt: timestamp,
    version: existing.version + 1,
  });
}

export async function deletePage(id: string): Promise<boolean> {
  const page = await getStorage().getPage(id);
  if (!page) return false;

  const timestamp = now();

  // Remove from parent's childIds
  if (page.parentId) {
    const parent = await getStorage().getPage(page.parentId);
    if (parent) {
      await getStorage().updatePage(page.parentId, {
        childIds: parent.childIds.filter((cid: string) => cid !== id),
        updatedAt: timestamp,
        version: parent.version + 1,
      });
    }
  }

  // Recursively delete all children
  for (const childId of page.childIds) {
    await deletePage(childId);
  }

  // Delete all blocks for this page
  await getStorage().deleteBlocksByPage(id);

  return getStorage().deletePage(id);
}

export async function getPagesByOwner(ownerId: string): Promise<Page[]> {
  const allPages = await getStorage().getAllPages();
  return allPages.filter((page) => page.ownerId === ownerId);
}

export async function transferPageOwnership(
  pageId: string,
  newOwnerId: string
): Promise<Page | null> {
  const existing = await getStorage().getPage(pageId);
  if (!existing) return null;

  const timestamp = now();
  return getStorage().updatePage(pageId, {
    ownerId: newOwnerId,
    updatedAt: timestamp,
    version: existing.version + 1,
  });
}
