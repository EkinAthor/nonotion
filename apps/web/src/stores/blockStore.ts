import { create } from 'zustand';
import type { Block, BlockType, BlockContent, CreateBlockInput, UpdateBlockInput } from '@nonotion/shared';
import { blocksApi } from '@/api/client';

interface BlockState {
  blocksByPage: Map<string, Block[]>;
  selectedBlockId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchBlocks: (pageId: string) => Promise<void>;
  createBlock: (pageId: string, type: BlockType, content: BlockContent, order?: number) => Promise<Block>;
  updateBlock: (id: string, input: UpdateBlockInput) => Promise<Block>;
  deleteBlock: (id: string) => Promise<void>;
  reorderBlocks: (pageId: string, blockIds: string[]) => Promise<void>;
  setSelectedBlock: (id: string | null) => void;

  // Selectors
  getBlocksForPage: (pageId: string) => Block[];
}

export const useBlockStore = create<BlockState>((set, get) => ({
  blocksByPage: new Map(),
  selectedBlockId: null,
  isLoading: false,
  error: null,

  fetchBlocks: async (pageId) => {
    set({ isLoading: true, error: null });
    try {
      const blocks = await blocksApi.getByPage(pageId);
      set((state) => {
        const blocksByPage = new Map(state.blocksByPage);
        blocksByPage.set(pageId, blocks.sort((a, b) => a.order - b.order));
        return { blocksByPage, isLoading: false };
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  createBlock: async (pageId, type, content, order) => {
    const input: Omit<CreateBlockInput, 'pageId'> = { type, content, order };
    const block = await blocksApi.create(pageId, input);

    set((state) => {
      const blocksByPage = new Map(state.blocksByPage);
      const blocks = [...(blocksByPage.get(pageId) || [])];

      // Insert at correct position
      if (order !== undefined) {
        // Shift existing blocks
        blocks.forEach((b, i) => {
          if (b.order >= order) {
            blocks[i] = { ...b, order: b.order + 1 };
          }
        });
        blocks.push(block);
      } else {
        blocks.push(block);
      }

      blocksByPage.set(pageId, blocks.sort((a, b) => a.order - b.order));
      return { blocksByPage };
    });

    return block;
  },

  updateBlock: async (id, input) => {
    const block = await blocksApi.update(id, input);

    set((state) => {
      const blocksByPage = new Map(state.blocksByPage);
      const blocks = blocksByPage.get(block.pageId);

      if (blocks) {
        const index = blocks.findIndex((b) => b.id === id);
        if (index !== -1) {
          const updatedBlocks = [...blocks];
          updatedBlocks[index] = block;
          blocksByPage.set(block.pageId, updatedBlocks);
        }
      }

      return { blocksByPage };
    });

    return block;
  },

  deleteBlock: async (id) => {
    // Find the block to get its pageId
    let pageId: string | null = null;
    for (const [pId, blocks] of get().blocksByPage.entries()) {
      if (blocks.find((b) => b.id === id)) {
        pageId = pId;
        break;
      }
    }

    await blocksApi.delete(id);

    if (pageId) {
      set((state) => {
        const blocksByPage = new Map(state.blocksByPage);
        const blocks = blocksByPage.get(pageId!);

        if (blocks) {
          const filtered = blocks.filter((b) => b.id !== id);
          // Reorder remaining blocks
          const reordered = filtered.map((b, i) => ({ ...b, order: i }));
          blocksByPage.set(pageId!, reordered);
        }

        return { blocksByPage };
      });
    }
  },

  reorderBlocks: async (pageId, blockIds) => {
    // Optimistic update
    set((state) => {
      const blocksByPage = new Map(state.blocksByPage);
      const blocks = blocksByPage.get(pageId) || [];

      const reordered = blockIds.map((id, index) => {
        const block = blocks.find((b) => b.id === id);
        return block ? { ...block, order: index } : null;
      }).filter((b): b is Block => b !== null);

      blocksByPage.set(pageId, reordered);
      return { blocksByPage };
    });

    try {
      const blocks = await blocksApi.reorder(pageId, { blockIds });
      set((state) => {
        const blocksByPage = new Map(state.blocksByPage);
        blocksByPage.set(pageId, blocks.sort((a, b) => a.order - b.order));
        return { blocksByPage };
      });
    } catch (error) {
      // Revert on error by refetching
      await get().fetchBlocks(pageId);
      throw error;
    }
  },

  setSelectedBlock: (id) => {
    set({ selectedBlockId: id });
  },

  getBlocksForPage: (pageId) => {
    return get().blocksByPage.get(pageId) || [];
  },
}));
