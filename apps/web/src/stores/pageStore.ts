import { create } from 'zustand';
import type { Page, CreatePageInput, UpdatePageInput, PageTreeNode } from '@nonotion/shared';
import { pagesApi } from '@/api/client';

interface PageState {
  pages: Map<string, Page>;
  currentPageId: string | null;
  expandedNodes: Set<string>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPages: () => Promise<void>;
  setCurrentPage: (id: string | null) => void;
  createPage: (input: CreatePageInput) => Promise<Page>;
  updatePage: (id: string, input: UpdatePageInput) => Promise<Page>;
  deletePage: (id: string) => Promise<void>;
  toggleExpanded: (id: string) => void;

  // Selectors
  getPageTree: () => PageTreeNode[];
  getStarredPages: () => Page[];
  getBreadcrumbs: (pageId: string) => Page[];
}

export const usePageStore = create<PageState>((set, get) => ({
  pages: new Map(),
  currentPageId: null,
  expandedNodes: new Set(),
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

  updatePage: async (id, input) => {
    const page = await pagesApi.update(id, input);
    set((state) => {
      const pages = new Map(state.pages);
      pages.set(id, page);
      return { pages };
    });
    return page;
  },

  deletePage: async (id) => {
    const page = get().pages.get(id);
    await pagesApi.delete(id);
    set((state) => {
      const pages = new Map(state.pages);

      // Remove from parent's childIds
      if (page?.parentId) {
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
  },

  toggleExpanded: (id) => {
    set((state) => {
      const expandedNodes = new Set(state.expandedNodes);
      if (expandedNodes.has(id)) {
        expandedNodes.delete(id);
      } else {
        expandedNodes.add(id);
      }
      return { expandedNodes };
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
