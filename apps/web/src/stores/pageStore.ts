import { create } from 'zustand';
import type { Page, CreatePageInput, UpdatePageInput, PageTreeNode, UpdatePageOrderInput } from '@nonotion/shared';
import { pagesApi } from '@/api/client';

const EXPANDED_NODES_KEY = 'nonotion_expanded_nodes';
const STARRED_EXPANDED_NODES_KEY = 'nonotion_starred_expanded_nodes';

function loadExpandedSet(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch { /* ignore */ }
  return new Set();
}

function saveExpandedSet(key: string, nodes: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(nodes)));
  } catch { /* ignore */ }
}

interface PageState {
  pages: Map<string, Page>;
  currentPageId: string | null;
  expandedNodes: Set<string>;
  starredExpandedNodes: Set<string>;
  isLoading: boolean;
  error: string | null;
  rootPageOrder: string[];
  starredPageOrder: string[];

  // Actions
  fetchPages: () => Promise<void>;
  fetchPageOrder: () => Promise<void>;
  setCurrentPage: (id: string | null) => void;
  createPage: (input: CreatePageInput) => Promise<Page>;
  updatePage: (id: string, input: UpdatePageInput) => void;
  deletePage: (id: string) => void;
  patchPageLocal: (id: string, patch: Partial<Page>) => void;
  toggleExpanded: (id: string) => void;
  toggleStarredExpanded: (id: string) => void;
  updatePageOrder: (input: UpdatePageOrderInput) => void;
  movePage: (pageId: string, newParentId: string | null, insertIndex: number) => void;

  // Selectors
  getPageTree: () => PageTreeNode[];
  getStarredPages: () => Page[];
  getBreadcrumbs: (pageId: string) => Page[];
}

export const usePageStore = create<PageState>((set, get) => ({
  pages: new Map(),
  currentPageId: null,
  expandedNodes: loadExpandedSet(EXPANDED_NODES_KEY),
  starredExpandedNodes: loadExpandedSet(STARRED_EXPANDED_NODES_KEY),
  isLoading: false,
  error: null,
  rootPageOrder: [],
  starredPageOrder: [],

  fetchPages: async () => {
    set({ isLoading: true, error: null });
    try {
      const pages = await pagesApi.getAll();
      const pagesMap = new Map(pages.map((p) => [p.id, p]));
      set({ pages: pagesMap, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchPageOrder: async () => {
    try {
      const order = await pagesApi.getOrder();
      set({ rootPageOrder: order.rootPageOrder, starredPageOrder: order.starredPageOrder });
    } catch {
      // Non-critical, order just won't be applied
    }
  },

  setCurrentPage: (id) => {
    set({ currentPageId: id });
  },

  createPage: async (input) => {
    const page = await pagesApi.create(input);
    set((state) => {
      const pages = new Map(state.pages);
      pages.set(page.id, page);

      // Update parent's childIds in local state
      if (page.parentId) {
        const parent = pages.get(page.parentId);
        if (parent && !parent.childIds.includes(page.id)) {
          pages.set(page.parentId, {
            ...parent,
            childIds: [...parent.childIds, page.id],
          });
        }
      }

      // Append to root page order if root
      const rootPageOrder = !page.parentId
        ? [...state.rootPageOrder, page.id]
        : state.rootPageOrder;

      return { pages, rootPageOrder };
    });
    return page;
  },

  updatePage: (id, input) => {
    // 1. Snapshot previous state for revert
    const previousPage = get().pages.get(id);
    if (!previousPage) return;
    const prevRootOrder = get().rootPageOrder;
    const prevStarredOrder = get().starredPageOrder;

    // 2. Optimistic update: merge input immediately
    set((state) => {
      const pages = new Map(state.pages);
      const existing = pages.get(id);
      if (existing) {
        pages.set(id, { ...existing, ...input, updatedAt: new Date().toISOString() });
      }

      let rootPageOrder = state.rootPageOrder;
      let starredPageOrder = state.starredPageOrder;

      // Handle starred toggle
      if (input.isStarred !== undefined && input.isStarred !== previousPage.isStarred) {
        if (input.isStarred) {
          starredPageOrder = [...starredPageOrder, id];
        } else {
          starredPageOrder = starredPageOrder.filter((pid) => pid !== id);
        }
      }

      // Handle parent change (root <-> child)
      if (input.parentId !== undefined && input.parentId !== previousPage.parentId) {
        if (!previousPage.parentId && input.parentId) {
          // Was root, now child
          rootPageOrder = rootPageOrder.filter((pid) => pid !== id);
        } else if (previousPage.parentId && !input.parentId) {
          // Was child, now root
          rootPageOrder = [...rootPageOrder, id];
        }
      }

      return { pages, rootPageOrder, starredPageOrder };
    });

    // 3. Fire API call in background
    pagesApi.update(id, input).catch((error) => {
      console.error('Failed to update page:', error);
      // Revert to previous state
      set((state) => {
        const pages = new Map(state.pages);
        pages.set(id, previousPage);
        return { pages, rootPageOrder: prevRootOrder, starredPageOrder: prevStarredOrder };
      });
    });
  },

  deletePage: (id) => {
    const page = get().pages.get(id);
    if (!page) return;

    // 1. Snapshot for revert
    const previousPages = new Map(get().pages);
    const prevRootOrder = get().rootPageOrder;
    const prevStarredOrder = get().starredPageOrder;

    // 2. Optimistic removal
    set((state) => {
      const pages = new Map(state.pages);

      // Remove from parent's childIds
      if (page.parentId) {
        const parent = pages.get(page.parentId);
        if (parent) {
          pages.set(page.parentId, {
            ...parent,
            childIds: parent.childIds.filter((cid) => cid !== id),
          });
        }
      }

      // Collect all IDs being deleted (for order cleanup)
      const deletedIds = new Set<string>();
      const collectIds = (pageId: string) => {
        deletedIds.add(pageId);
        const p = pages.get(pageId);
        if (p) p.childIds.forEach(collectIds);
      };
      collectIds(id);

      // Remove page and all its children recursively
      const removeRecursive = (pageId: string) => {
        const p = pages.get(pageId);
        if (p) {
          p.childIds.forEach(removeRecursive);
          pages.delete(pageId);
        }
      };
      removeRecursive(id);

      return {
        pages,
        currentPageId: state.currentPageId === id ? null : state.currentPageId,
        rootPageOrder: state.rootPageOrder.filter((pid) => !deletedIds.has(pid)),
        starredPageOrder: state.starredPageOrder.filter((pid) => !deletedIds.has(pid)),
      };
    });

    // 3. Fire API delete in background
    pagesApi.delete(id).catch((error) => {
      console.error('Failed to delete page:', error);
      // Revert by restoring snapshot
      set({ pages: previousPages, rootPageOrder: prevRootOrder, starredPageOrder: prevStarredOrder });
    });
  },

  patchPageLocal: (id, patch) => {
    set((state) => {
      const existing = state.pages.get(id);
      if (!existing) return state;
      const pages = new Map(state.pages);
      pages.set(id, {
        ...existing,
        ...patch,
        properties: patch.properties
          ? { ...existing.properties, ...patch.properties }
          : existing.properties,
      });
      return { pages };
    });
  },

  toggleExpanded: (id) => {
    set((state) => {
      const expandedNodes = new Set(state.expandedNodes);
      if (expandedNodes.has(id)) {
        expandedNodes.delete(id);
      } else {
        expandedNodes.add(id);
      }
      saveExpandedSet(EXPANDED_NODES_KEY, expandedNodes);
      return { expandedNodes };
    });
  },

  toggleStarredExpanded: (id) => {
    set((state) => {
      const starredExpandedNodes = new Set(state.starredExpandedNodes);
      if (starredExpandedNodes.has(id)) {
        starredExpandedNodes.delete(id);
      } else {
        starredExpandedNodes.add(id);
      }
      saveExpandedSet(STARRED_EXPANDED_NODES_KEY, starredExpandedNodes);
      return { starredExpandedNodes };
    });
  },

  updatePageOrder: (input) => {
    const prevRootOrder = get().rootPageOrder;
    const prevStarredOrder = get().starredPageOrder;

    // Optimistic
    set((state) => ({
      rootPageOrder: input.rootPageOrder ?? state.rootPageOrder,
      starredPageOrder: input.starredPageOrder ?? state.starredPageOrder,
    }));

    pagesApi.updateOrder(input).catch((error) => {
      console.error('Failed to update page order:', error);
      set({ rootPageOrder: prevRootOrder, starredPageOrder: prevStarredOrder });
    });
  },

  movePage: (pageId, newParentId, insertIndex) => {
    const state = get();
    const page = state.pages.get(pageId);
    if (!page) return;

    const oldParentId = page.parentId;
    if (oldParentId === newParentId) {
      // Same parent — just reorder
      if (newParentId === null) {
        const rootIds = state.rootPageOrder.filter((id) => id !== pageId);
        rootIds.splice(insertIndex, 0, pageId);
        get().updatePageOrder({ rootPageOrder: rootIds });
      } else {
        const parent = state.pages.get(newParentId);
        if (!parent) return;
        const childIds = parent.childIds.filter((id) => id !== pageId);
        childIds.splice(insertIndex, 0, pageId);
        get().updatePage(newParentId, { childIds });
      }
      return;
    }

    // Snapshot for revert
    const prevPages = new Map(state.pages);
    const prevRootOrder = state.rootPageOrder;

    // Optimistic update
    set((s) => {
      const pages = new Map(s.pages);
      let rootPageOrder = [...s.rootPageOrder];

      // Update the page's parentId
      pages.set(pageId, { ...page, parentId: newParentId });

      // Remove from old parent's childIds
      if (oldParentId) {
        const oldParent = pages.get(oldParentId);
        if (oldParent) {
          pages.set(oldParentId, {
            ...oldParent,
            childIds: oldParent.childIds.filter((id) => id !== pageId),
          });
        }
      } else {
        // Was root — remove from rootPageOrder
        rootPageOrder = rootPageOrder.filter((id) => id !== pageId);
      }

      // Add to new parent's childIds at insertIndex
      if (newParentId) {
        const newParent = pages.get(newParentId);
        if (newParent) {
          const childIds = [...newParent.childIds];
          childIds.splice(insertIndex, 0, pageId);
          pages.set(newParentId, { ...newParent, childIds });
        }
      } else {
        // Moving to root
        rootPageOrder.splice(insertIndex, 0, pageId);
      }

      return { pages, rootPageOrder };
    });

    // API calls: first update parentId (backend handles old/new parent childIds),
    // then fix the order since the backend appends to end.
    pagesApi.update(pageId, { parentId: newParentId }).then(async () => {
      // After parentId change is persisted, fix the child order or root order
      if (newParentId) {
        const newParent = get().pages.get(newParentId);
        if (newParent) {
          await pagesApi.update(newParentId, { childIds: newParent.childIds });
        }
      } else {
        await pagesApi.updateOrder({ rootPageOrder: get().rootPageOrder });
      }
    }).catch((error) => {
      console.error('Failed to move page:', error);
      set({ pages: prevPages, rootPageOrder: prevRootOrder });
    });
  },

  getPageTree: () => {
    const { pages, rootPageOrder } = get();

    const buildTree = (pageId: string): PageTreeNode | null => {
      const page = pages.get(pageId);
      if (!page) return null;

      return {
        ...page,
        children: page.childIds
          .map(buildTree)
          .filter((n): n is PageTreeNode => n !== null),
      };
    };

    // Collect root pages
    const rootPages: PageTreeNode[] = [];
    const addedIds = new Set<string>();

    // First add pages in order
    for (const id of rootPageOrder) {
      if (addedIds.has(id)) continue;
      const page = pages.get(id);
      if (page && !page.parentId) {
        const tree = buildTree(id);
        if (tree) {
          rootPages.push(tree);
          addedIds.add(id);
        }
      }
    }

    // Then append any root pages not in the order array
    pages.forEach((page) => {
      if (!page.parentId && !addedIds.has(page.id)) {
        const tree = buildTree(page.id);
        if (tree) rootPages.push(tree);
      }
    });

    return rootPages;
  },

  getStarredPages: () => {
    const { pages, starredPageOrder } = get();
    const starred = Array.from(pages.values()).filter((p) => p.isStarred);

    // Sort by starredPageOrder, append unordered at end
    const orderMap = new Map(starredPageOrder.map((id, idx) => [id, idx]));
    starred.sort((a, b) => {
      const aIdx = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });

    return starred;
  },

  getBreadcrumbs: (pageId) => {
    const { pages } = get();
    const breadcrumbs: Page[] = [];
    let current = pages.get(pageId);

    while (current) {
      breadcrumbs.unshift(current);
      current = current.parentId ? pages.get(current.parentId) : undefined;
    }

    return breadcrumbs;
  },
}));
