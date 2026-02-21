import { create } from 'zustand';
import type { Page, CreatePageInput, UpdatePageInput, PageTreeNode } from '@nonotion/shared';
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

  // Actions
  fetchPages: () => Promise<void>;
  setCurrentPage: (id: string | null) => void;
  createPage: (input: CreatePageInput) => Promise<Page>;
  updatePage: (id: string, input: UpdatePageInput) => void;
  deletePage: (id: string) => void;
  toggleExpanded: (id: string) => void;
  toggleStarredExpanded: (id: string) => void;

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

      return { pages };
    });
    return page;
  },

  updatePage: (id, input) => {
    // 1. Snapshot previous page for revert
    const previousPage = get().pages.get(id);
    if (!previousPage) return;

    // 2. Optimistic update: merge input immediately
    set((state) => {
      const pages = new Map(state.pages);
      const existing = pages.get(id);
      if (existing) {
        pages.set(id, { ...existing, ...input, updatedAt: new Date().toISOString() });
      }
      return { pages };
    });

    // 3. Fire API call in background
    pagesApi.update(id, input).catch((error) => {
      console.error('Failed to update page:', error);
      // Revert to previous state
      set((state) => {
        const pages = new Map(state.pages);
        pages.set(id, previousPage);
        return { pages };
      });
    });
  },

  deletePage: (id) => {
    const page = get().pages.get(id);
    if (!page) return;

    // 1. Snapshot for revert
    const previousPages = new Map(get().pages);

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
      };
    });

    // 3. Fire API delete in background
    pagesApi.delete(id).catch((error) => {
      console.error('Failed to delete page:', error);
      // Revert by restoring snapshot
      set({ pages: previousPages });
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

  getPageTree: () => {
    const { pages } = get();
    const rootPages: PageTreeNode[] = [];

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

    pages.forEach((page) => {
      if (!page.parentId) {
        const tree = buildTree(page.id);
        if (tree) rootPages.push(tree);
      }
    });

    return rootPages;
  },

  getStarredPages: () => {
    const { pages } = get();
    return Array.from(pages.values()).filter((p) => p.isStarred);
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
