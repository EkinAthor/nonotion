import { create } from 'zustand';
import type { Block, BlockType, BlockContent, CreateBlockInput, UpdateBlockInput } from '@nonotion/shared';
import { generateBlockId } from '@nonotion/shared';
import { blocksApi } from '@/api/client';

// Temp ID → real server ID mapping (only needed for API calls)
const tempToRealId = new Map<string, string>();
// Temp ID → create promise (for sequencing dependent operations)
const pendingCreates = new Map<string, Promise<Block>>();

function resolveId(id: string): string {
  return tempToRealId.get(id) ?? id;
}

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

  // Multi-block drag state
  draggedBlockIds: string[]; // effective drag set during active drag, empty when idle
  setDraggedBlockIds: (ids: string[]) => void;
  clearDraggedBlockIds: () => void;
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
  draggedBlockIds: [],

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
    // 1. Generate temp block immediately
    const tempId = generateBlockId();
    const tempBlock: Block = {
      id: tempId,
      type,
      pageId,
      order: order ?? 0,
      content,
      version: 0,
    };

    // 2. Optimistic update: insert temp block into store
    set((state) => {
      const blocksByPage = new Map(state.blocksByPage);
      const blocks = [...(blocksByPage.get(pageId) || [])];

      if (order !== undefined) {
        // Shift existing blocks
        blocks.forEach((b, i) => {
          if (b.order >= order) {
            blocks[i] = { ...b, order: b.order + 1 };
          }
        });
        blocks.push(tempBlock);
      } else {
        // No order specified — place at end
        tempBlock.order = blocks.length;
        blocks.push(tempBlock);
      }

      blocksByPage.set(pageId, blocks.sort((a, b) => a.order - b.order));
      return { blocksByPage };
    });

    // 3. Fire API call in background
    const input: Omit<CreateBlockInput, 'pageId'> = { type, content, order };
    const createPromise = blocksApi.create(pageId, input).then((realBlock) => {
      // Store temp→real ID mapping
      tempToRealId.set(tempId, realBlock.id);

      // Update version in store (keep tempId as the canonical store key)
      set((state) => {
        const blocksByPage = new Map(state.blocksByPage);
        const blocks = blocksByPage.get(pageId);
        if (blocks) {
          const index = blocks.findIndex((b) => b.id === tempId);
          if (index !== -1) {
            const updatedBlocks = [...blocks];
            updatedBlocks[index] = { ...updatedBlocks[index], version: realBlock.version };
            blocksByPage.set(pageId, updatedBlocks);
          }
        }
        return { blocksByPage };
      });

      pendingCreates.delete(tempId);
      return realBlock;
    }).catch((error) => {
      // Remove temp block from store on failure
      set((state) => {
        const blocksByPage = new Map(state.blocksByPage);
        const blocks = blocksByPage.get(pageId);
        if (blocks) {
          const filtered = blocks.filter((b) => b.id !== tempId);
          const reordered = filtered.map((b, i) => ({ ...b, order: i }));
          blocksByPage.set(pageId, reordered);
        }
        return { blocksByPage };
      });
      pendingCreates.delete(tempId);
      console.error('Failed to create block:', error);
      throw error;
    });

    pendingCreates.set(tempId, createPromise);

    // 4. Return temp block immediately (callers see it instantly)
    return tempBlock;
  },

  createMultipleBlocks: async (pageId, blocksToCreate, afterOrder) => {
    // Delegate to optimistic createBlock for each — all appear instantly
    const createdBlocks: Block[] = [];
    for (let i = 0; i < blocksToCreate.length; i++) {
      const { type, content } = blocksToCreate[i];
      const order = afterOrder + 1 + i;
      const block = await get().createBlock(pageId, type, content, order);
      createdBlocks.push(block);
    }
    return createdBlocks;
  },

  updateBlock: async (id, input) => {
    // 1. Optimistic update: apply input to local state immediately
    //    This keeps the store in sync with the editor for operations
    //    that read from the store (e.g., merge blocks)
    let targetPageId: string | null = null;
    set((state) => {
      const blocksByPage = new Map(state.blocksByPage);
      for (const [pageId, blocks] of blocksByPage) {
        const index = blocks.findIndex((b) => b.id === id);
        if (index !== -1) {
          targetPageId = pageId;
          const updatedBlocks = [...blocks];
          updatedBlocks[index] = { ...blocks[index], ...input };
          blocksByPage.set(pageId, updatedBlocks);
          break;
        }
      }
      return { blocksByPage };
    });

    try {
      // Wait for pending create if this block was just created
      const pending = pendingCreates.get(id);
      if (pending) await pending;

      // Guard: block may have been deleted while we waited
      if (!get().getBlockById(id)) return { id, ...input } as Block;

      const realId = resolveId(id);
      const block = await blocksApi.update(realId, input);

      // 2. On API success: only update metadata (version, updatedAt)
      //    DO NOT overwrite content — it may have advanced locally
      set((state) => {
        const blocksByPage = new Map(state.blocksByPage);
        for (const [pageId, blocks] of blocksByPage) {
          const index = blocks.findIndex((b) => b.id === id);
          if (index !== -1) {
            const updatedBlocks = [...blocks];
            updatedBlocks[index] = {
              ...updatedBlocks[index],
              version: block.version,
            };
            blocksByPage.set(pageId, updatedBlocks);
            break;
          }
        }
        return { blocksByPage };
      });

      return block;
    } catch (error) {
      // 3. On error: revert by refetching from server
      if (targetPageId) {
        await get().fetchBlocks(targetPageId);
      }
      throw error;
    }
  },

  deleteBlock: async (id) => {
    // Find the block's pageId before removing
    let pageId: string | null = null;
    for (const [pId, blocks] of get().blocksByPage.entries()) {
      if (blocks.find((b) => b.id === id)) {
        pageId = pId;
        break;
      }
    }

    // 1. Optimistic removal from store
    if (pageId) {
      set((state) => {
        const blocksByPage = new Map(state.blocksByPage);
        const blocks = blocksByPage.get(pageId!);

        if (blocks) {
          const filtered = blocks.filter((b) => b.id !== id);
          const reordered = filtered.map((b, i) => ({ ...b, order: i }));
          blocksByPage.set(pageId!, reordered);
        }

        return { blocksByPage };
      });
    }

    // 2. Fire API delete in background
    const pending = pendingCreates.get(id);
    const doDelete = async () => {
      if (pending) await pending;
      const realId = resolveId(id);
      await blocksApi.delete(realId);
      // Cleanup ID mapping
      tempToRealId.delete(id);
    };

    doDelete().catch((error) => {
      console.error('Failed to delete block:', error);
      // Revert by refetching
      if (pageId) {
        get().fetchBlocks(pageId);
      }
    });
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
      // Resolve temp IDs to real server IDs for the API call
      const resolvedIds = blockIds.map(resolveId);
      const blocks = await blocksApi.reorder(pageId, { blockIds: resolvedIds });
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
      case 'divider':
        content = {} as BlockContent;
        break;
      case 'page_link':
        content = { linkedPageId: '' } as BlockContent;
        break;
      case 'database_view':
        content = { databaseId: '' } as BlockContent;
        break;
      case 'paragraph':
      default:
        content = { text };
        break;
    }

    // Optimistic update: apply type + content locally first
    set((state) => {
      const blocksByPage = new Map(state.blocksByPage);
      for (const [pageId, blocks] of blocksByPage) {
        const index = blocks.findIndex((b) => b.id === id);
        if (index !== -1) {
          const updatedBlocks = [...blocks];
          updatedBlocks[index] = { ...blocks[index], type: newType, content };
          blocksByPage.set(pageId, updatedBlocks);
          break;
        }
      }
      return { blocksByPage };
    });

    // Fire API call in background (same pattern as deleteBlock)
    const doUpdate = async () => {
      const pending = pendingCreates.get(id);
      if (pending) await pending;
      const realId = resolveId(id);
      const block = await blocksApi.update(realId, { type: newType, content });

      // Update version from server response
      set((state) => {
        const blocksByPage = new Map(state.blocksByPage);
        for (const [pageId, blocks] of blocksByPage) {
          const index = blocks.findIndex((b) => b.id === id);
          if (index !== -1) {
            const updatedBlocks = [...blocks];
            updatedBlocks[index] = {
              ...updatedBlocks[index],
              version: block.version,
            };
            blocksByPage.set(pageId, updatedBlocks);
            break;
          }
        }
        return { blocksByPage };
      });
    };

    doUpdate().catch((error) => {
      console.error('Failed to change block type:', error);
      const blk = get().getBlockById(id);
      if (blk) get().fetchBlocks(blk.pageId);
    });

    // Return optimistic block immediately
    return { ...existingBlock, type: newType, content };
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

    // deleteBlock is now optimistic — all removals happen synchronously
    ids.forEach(id => deleteBlock(id));

    clearSelection();

    if (prevBlockId) {
      get().setFocusBlock(prevBlockId, 'end');
    }
  },

  setDraggedBlockIds: (ids) => {
    set({ draggedBlockIds: ids });
  },

  clearDraggedBlockIds: () => {
    set({ draggedBlockIds: [] });
  },
}));
