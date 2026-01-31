import type { Page, CreatePageInput, UpdatePageInput } from '@nonotion/shared';
import { generatePageId, now } from '@nonotion/shared';
import { storage } from '../storage/json-storage.js';

export async function getAllPages(): Promise<Page[]> {
  return storage.getAllPages();
}

export async function getPage(id: string): Promise<Page | null> {
  return storage.getPage(id);
}

export async function createPage(input: CreatePageInput): Promise<Page> {
  const timestamp = now();
  const page: Page = {
    id: generatePageId(),
    title: input.title,
    parentId: input.parentId ?? null,
    childIds: [],
    icon: input.icon ?? null,
    isStarred: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  };

  // If page has a parent, add it to parent's childIds
  if (page.parentId) {
    const parent = await storage.getPage(page.parentId);
    if (parent) {
      await storage.updatePage(page.parentId, {
        childIds: [...parent.childIds, page.id],
        updatedAt: timestamp,
        version: parent.version + 1,
      });
    }
  }

  return storage.createPage(page);
}

export async function updatePage(id: string, input: UpdatePageInput): Promise<Page | null> {
  const existing = await storage.getPage(id);
  if (!existing) return null;

  const timestamp = now();

  // Handle parent change
  if (input.parentId !== undefined && input.parentId !== existing.parentId) {
    // Remove from old parent
    if (existing.parentId) {
      const oldParent = await storage.getPage(existing.parentId);
      if (oldParent) {
        await storage.updatePage(existing.parentId, {
          childIds: oldParent.childIds.filter((cid) => cid !== id),
          updatedAt: timestamp,
          version: oldParent.version + 1,
        });
      }
    }

    // Add to new parent
    if (input.parentId) {
      const newParent = await storage.getPage(input.parentId);
      if (newParent) {
        await storage.updatePage(input.parentId, {
          childIds: [...newParent.childIds, id],
          updatedAt: timestamp,
          version: newParent.version + 1,
        });
      }
    }
  }

  return storage.updatePage(id, {
    ...input,
    updatedAt: timestamp,
    version: existing.version + 1,
  });
}

export async function deletePage(id: string): Promise<boolean> {
  const page = await storage.getPage(id);
  if (!page) return false;

  const timestamp = now();

  // Remove from parent's childIds
  if (page.parentId) {
    const parent = await storage.getPage(page.parentId);
    if (parent) {
      await storage.updatePage(page.parentId, {
        childIds: parent.childIds.filter((cid) => cid !== id),
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
  await storage.deleteBlocksByPage(id);

  return storage.deletePage(id);
}
