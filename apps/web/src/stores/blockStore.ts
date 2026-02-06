import { create } from 'zustand';
import type { Block, BlockType, BlockContent, CreateBlockInput, UpdateBlockInput } from '@nonotion/shared';
import { blocksApi } from '@/api/client';

export type FocusPosition = 'start' | 'end' | number | null;

interface BlockState {
  blocksByPage: Map<string, Block[]>;
  selectedBlockId: string | null;
  focusBlockId: string | null;
  focusPosition: FocusPosition;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchBlocks: (pageId: string) => Promise<void>;
  createBlock: (pageId: string, type: BlockType, content: BlockContent, order?: number) => Promise<Block>;
  createMultipleBlocks: (
    pageId: string,
    blocks: Array<{ type: BlockType; content: BlockContent }>,
    afterOrder: number
  ) => Promise<Block[]>;
  updateBlock: (id: string, input: UpdateBlockInput) => Promise<Block>;
  deleteBlock: (id: string) => Promise<void>;
  reorderBlocks: (pageId: string, blockIds: string[]) => Promise<void>;
  setSelectedBlock: (id: string | null) => void;
  setFocusBlock: (id: string | null, position?: FocusPosition) => void;
  changeBlockType: (id: string, newType: BlockType, newText?: string) => Promise<Block>;

  // Selectors
  getBlocksForPage: (pageId: string) => Block[];
  getBlockById: (blockId: string) => Block | undefined;
  getAdjacentBlockId: (blockId: string, direction: 'prev' | 'next') => string | null;

  // Multi-selection
  selectedBlockIds: Set<string>;
  selectionAnchorId: string | null; // The block where selection started
  startMultiSelection: (id: string) => void;
  updateMultiSelection: (currentId: string) => void;
  clearSelection: () => void;
  selectAll: (pageId: string) => void;
  deleteSelectedBlocks: () => Promise<void>;
}

export const useBlockStore = create<BlockState>((set, get) => ({
  blocksByPage: new Map(),
  selectedBlockId: null,
  focusBlockId: null,
  focusPosition: 'end' as FocusPosition,
  isLoading: false,
  error: null,
  selectedBlockIds: new Set(),
  selectionAnchorId: null,

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

  createMultipleBlocks: async (pageId, blocksToCreate, afterOrder) => {
    const createdBlocks: Block[] = [];

    // Create blocks sequentially to maintain order
    for (let i = 0; i < blocksToCreate.length; i++) {
      const { type, content } = blocksToCreate[i];
      const order = afterOrder + 1 + i;
      const input: Omit<CreateBlockInput, 'pageId'> = { type, content, order };
      const block = await blocksApi.create(pageId, input);
      createdBlocks.push(block);
    }

    // Update state with all new blocks
    set((state) => {
      const blocksByPage = new Map(state.blocksByPage);
      const blocks = [...(blocksByPage.get(pageId) || [])];

      // Shift existing blocks that come after the insertion point
      const shiftAmount = blocksToCreate.length;
      blocks.forEach((b, i) => {
        if (b.order > afterOrder) {
          blocks[i] = { ...b, order: b.order + shiftAmount };
        }
      });

      // Add all new blocks
      blocks.push(...createdBlocks);
      blocksByPage.set(pageId, blocks.sort((a, b) => a.order - b.order));
      return { blocksByPage };
    });

    return createdBlocks;
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

  setFocusBlock: (id, position = 'end') => {
    set({ focusBlockId: id, focusPosition: position });
  },

  changeBlockType: async (id, newType, newText) => {
    // Find the block to get its current content
    let existingBlock: Block | undefined;
    for (const blocks of get().blocksByPage.values()) {
      existingBlock = blocks.find((b) => b.id === id);
      if (existingBlock) break;
    }

    if (!existingBlock) {
      throw new Error(`Block ${id} not found`);
    }

    // Get text and indent from existing content (handle different content structures)
    const existingContent = existingBlock.content;
    let existingText = '';
    let existingIndent: number | undefined;
    if ('text' in existingContent) {
      existingText = existingContent.text;
    } else if ('code' in existingContent) {
      existingText = existingContent.code;
    }
    if ('indent' in existingContent && typeof existingContent.indent === 'number') {
      existingIndent = existingContent.indent;
    }

    // Use newText if provided, otherwise preserve existing text
    const text = newText !== undefined ? newText : existingText;

    // Create content for new type
    let content: BlockContent;
    switch (newType) {
      case 'heading':
        content = { text, level: 1 };
        break;
      case 'heading2':
        content = { text, level: 2 };
        break;
      case 'heading3':
        content = { text, level: 3 };
        break;
      case 'bullet_list':
      case 'numbered_list':
        // Preserve indent when converting between list types
        content = existingIndent !== undefined ? { text, indent: existingIndent } : { text };
        break;
      case 'checklist':
        // Preserve indent when converting between list types
        content = existingIndent !== undefined
          ? { text, checked: false, indent: existingIndent }
          : { text, checked: false };
        break;
      case 'code_block':
        content = { code: text, language: '' };
        break;
      case 'image':
        content = { url: '', alt: '', caption: '' };
        break;
      case 'paragraph':
      default:
        content = { text };
        break;
    }

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

  startMultiSelection: (id) => {
    set({
      selectionAnchorId: id,
      selectedBlockIds: new Set([id]),
      focusBlockId: null, // Blur any active editor
    });
  },

  updateMultiSelection: (currentId) => {
    const { selectionAnchorId, blocksByPage } = get();
    if (!selectionAnchorId) return;

    // Find page and blocks
    let pageBlocks: Block[] | undefined;
    for (const blocks of blocksByPage.values()) {
      if (blocks.find(b => b.id === selectionAnchorId)) {
        pageBlocks = blocks;
        break;
      }
    }

    if (!pageBlocks) return;

    const sortedBlocks = [...pageBlocks].sort((a, b) => a.order - b.order);
    const startIndex = sortedBlocks.findIndex(b => b.id === selectionAnchorId);
    const currentIndex = sortedBlocks.findIndex(b => b.id === currentId);

    if (startIndex === -1 || currentIndex === -1) return;

    const start = Math.min(startIndex, currentIndex);
    const end = Math.max(startIndex, currentIndex);

    const newSelection = new Set<string>();
    for (let i = start; i <= end; i++) {
      newSelection.add(sortedBlocks[i].id);
    }

    set({ selectedBlockIds: newSelection });
  },

  clearSelection: () => {
    set({
      selectedBlockIds: new Set(),
      selectionAnchorId: null,
    });
  },

  selectAll: (pageId) => {
    const blocks = get().blocksByPage.get(pageId);
    if (blocks) {
      set({
        selectedBlockIds: new Set(blocks.map(b => b.id)),
        selectionAnchorId: blocks[0]?.id || null,
        focusBlockId: null,
      });
    }
  },

  deleteSelectedBlocks: async () => {
    const { selectedBlockIds, deleteBlock, clearSelection } = get();
    const ids = Array.from(selectedBlockIds);

    // Sort ids by order to delete cleanly or batch
    // taking a simple approach: delete one by one
    // Ideally backend should support batch delete

    // We should find the block before the first deleted block to focus it
    // But since we delete one by one, we can just focus the one before the TOPMOST deleted block

    // 1. Find all selected blocks
    // 2. Find the block immediately preceding the first selected block

    /* 
       Actually, `deleteBlock` handles reordering. 
       If we delete multiple, we should probably do it carefully.
       For now, let's just delete them one by one.
    */

    if (ids.length === 0) return;

    // Find the page and sort blocks to find the top-most selected block
    const allBlocks = Array.from(get().blocksByPage.values()).flat();
    const selectedBlocks = allBlocks.filter(b => selectedBlockIds.has(b.id)).sort((a, b) => a.order - b.order);

    if (selectedBlocks.length === 0) return;

    const firstBlock = selectedBlocks[0];
    const prevBlockId = get().getAdjacentBlockId(firstBlock.id, 'prev');

    await Promise.all(ids.map(id => deleteBlock(id)));

    clearSelection();

    if (prevBlockId) {
      get().setFocusBlock(prevBlockId, 'end');
    }
  },
}));
