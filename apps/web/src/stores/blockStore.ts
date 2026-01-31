import { create } from 'zustand';
import type { Block, BlockType, BlockContent, CreateBlockInput, UpdateBlockInput } from '@nonotion/shared';
import { blocksApi } from '@/api/client';

interface BlockState {
  blocksByPage: Map<string, Block[]>;
  selectedBlockId: string | null;
  focusBlockId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchBlocks: (pageId: string) => Promise<void>;
  createBlock: (pageId: string, type: BlockType, content: BlockContent, order?: number) => Promise<Block>;
  updateBlock: (id: string, input: UpdateBlockInput) => Promise<Block>;
  deleteBlock: (id: string) => Promise<void>;
  reorderBlocks: (pageId: string, blockIds: string[]) => Promise<void>;
  setSelectedBlock: (id: string | null) => void;
  setFocusBlock: (id: string | null) => void;
  changeBlockType: (id: string, newType: BlockType, preserveText?: boolean) => Promise<Block>;

  // Selectors
  getBlocksForPage: (pageId: string) => Block[];
  getBlockById: (blockId: string) => Block | undefined;
  getAdjacentBlockId: (blockId: string, direction: 'prev' | 'next') => string | null;
}

export const useBlockStore = create<BlockState>((set, get) => ({
  blocksByPage: new Map(),
  selectedBlockId: null,
  focusBlockId: null,
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

  setFocusBlock: (id) => {
    set({ focusBlockId: id });
  },

  changeBlockType: async (id, newType, preserveText = true) => {
    // Find the block to get its current content
    let existingBlock: Block | undefined;
    for (const blocks of get().blocksByPage.values()) {
      existingBlock = blocks.find((b) => b.id === id);
      if (existingBlock) break;
    }

    if (!existingBlock) {
      throw new Error(`Block ${id} not found`);
    }

    // Extract text from current content
    const text = preserveText ? existingBlock.content.text : '';

    // Create content for new type
    const content: BlockContent = newType === 'heading'
      ? { text, level: 1 }
      : { text };

    // Update block with new type and content
    const block = await blocksApi.update(id, { type: newType, content });

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

  getBlocksForPage: (pageId) => {
    return get().blocksByPage.get(pageId) || [];
  },

  getBlockById: (blockId) => {
    for (const blocks of get().blocksByPage.values()) {
      const block = blocks.find((b) => b.id === blockId);
      if (block) return block;
    }
    return undefined;
  },

  getAdjacentBlockId: (blockId, direction) => {
    for (const blocks of get().blocksByPage.values()) {
      const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
      const currentIndex = sortedBlocks.findIndex((b) => b.id === blockId);
      if (currentIndex !== -1) {
        if (direction === 'prev' && currentIndex > 0) {
          return sortedBlocks[currentIndex - 1].id;
        }
        if (direction === 'next' && currentIndex < sortedBlocks.length - 1) {
          return sortedBlocks[currentIndex + 1].id;
        }
        return null;
      }
    }
    return null;
  },
}));
