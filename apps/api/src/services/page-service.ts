import type { Page, CreatePageInput, UpdatePageInput, PageOrderSettings, UpdatePageOrderInput } from '@nonotion/shared';
import { generatePageId, now } from '@nonotion/shared';
import { getStorage } from '../storage/storage-factory.js';
import { createDefaultSchema } from './database-service.js';

const ROOT_PAGE_ORDER_KEY = 'rootPageOrder';
const STARRED_PAGE_ORDER_KEY = 'starredPageOrder';

async function getOrderArray(key: string): Promise<string[]> {
  const raw = await getStorage().getSetting(key);
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

async function setOrderArray(key: string, ids: string[]): Promise<void> {
  await getStorage().setSetting(key, JSON.stringify(ids));
}

export async function getPageOrder(): Promise<PageOrderSettings> {
  const [rootPageOrder, starredPageOrder] = await Promise.all([
    getOrderArray(ROOT_PAGE_ORDER_KEY),
    getOrderArray(STARRED_PAGE_ORDER_KEY),
  ]);
  return { rootPageOrder, starredPageOrder };
}

export async function updatePageOrder(input: UpdatePageOrderInput): Promise<PageOrderSettings> {
  if (input.rootPageOrder !== undefined) {
    await setOrderArray(ROOT_PAGE_ORDER_KEY, input.rootPageOrder);
  }
  if (input.starredPageOrder !== undefined) {
    await setOrderArray(STARRED_PAGE_ORDER_KEY, input.starredPageOrder);
  }
  return getPageOrder();
}

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

  const created = await getStorage().createPage(page);

  // Append to root page order if it's a root page
  if (!page.parentId) {
    const order = await getOrderArray(ROOT_PAGE_ORDER_KEY);
    order.push(page.id);
    await setOrderArray(ROOT_PAGE_ORDER_KEY, order);
  }

  return created;
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

    // Maintain root page order: moving to/from root
    if (!existing.parentId && input.parentId) {
      // Was root, now has parent — remove from root order
      const order = await getOrderArray(ROOT_PAGE_ORDER_KEY);
      await setOrderArray(ROOT_PAGE_ORDER_KEY, order.filter((pid) => pid !== id));
    } else if (existing.parentId && !input.parentId) {
      // Was child, now root — append to root order
      const order = await getOrderArray(ROOT_PAGE_ORDER_KEY);
      order.push(id);
      await setOrderArray(ROOT_PAGE_ORDER_KEY, order);
    }
  }

  // Handle starred change
  if (input.isStarred !== undefined && input.isStarred !== existing.isStarred) {
    const starredOrder = await getOrderArray(STARRED_PAGE_ORDER_KEY);
    if (input.isStarred) {
      starredOrder.push(id);
    } else {
      const idx = starredOrder.indexOf(id);
      if (idx !== -1) starredOrder.splice(idx, 1);
    }
    await setOrderArray(STARRED_PAGE_ORDER_KEY, starredOrder);
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

  // Remove from order arrays
  const [rootOrder, starredOrder] = await Promise.all([
    getOrderArray(ROOT_PAGE_ORDER_KEY),
    getOrderArray(STARRED_PAGE_ORDER_KEY),
  ]);
  if (rootOrder.includes(id)) {
    await setOrderArray(ROOT_PAGE_ORDER_KEY, rootOrder.filter((pid) => pid !== id));
  }
  if (starredOrder.includes(id)) {
    await setOrderArray(STARRED_PAGE_ORDER_KEY, starredOrder.filter((pid) => pid !== id));
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
