import type { Block, CreateBlockInput, UpdateBlockInput, ReorderBlocksInput } from '@nonotion/shared';
import { generateBlockId } from '@nonotion/shared';
import { storage } from '../storage/json-storage.js';

export async function getBlocksByPage(pageId: string): Promise<Block[]> {
  return storage.getBlocksByPage(pageId);
}

export async function getBlock(id: string): Promise<Block | null> {
  return storage.getBlock(id);
}

export async function createBlock(input: CreateBlockInput): Promise<Block> {
  const existingBlocks = await storage.getBlocksByPage(input.pageId);

  // If order is not specified, add at the end
  const order = input.order ?? existingBlocks.length;

  // Shift existing blocks if inserting in the middle
  if (order < existingBlocks.length) {
    for (const block of existingBlocks) {
      if (block.order >= order) {
        await storage.updateBlock(block.id, {
          order: block.order + 1,
          version: block.version + 1,
        });
      }
    }
  }

  const block: Block = {
    id: generateBlockId(),
    type: input.type,
    pageId: input.pageId,
    order,
    content: input.content,
    version: 1,
  };

  return storage.createBlock(block);
}

export async function updateBlock(id: string, input: UpdateBlockInput): Promise<Block | null> {
  const existing = await storage.getBlock(id);
  if (!existing) return null;

  const updates: Partial<Block> & { version: number } = {
    version: existing.version + 1,
  };

  if (input.type !== undefined) {
    updates.type = input.type;
  }
  if (input.content !== undefined) {
    updates.content = input.content;
  }
  if (input.order !== undefined) {
    updates.order = input.order;
  }

  return storage.updateBlock(id, updates);
}

export async function deleteBlock(id: string): Promise<boolean> {
  const block = await storage.getBlock(id);
  if (!block) return false;

  const success = await storage.deleteBlock(id);
  if (!success) return false;

  // Reorder remaining blocks
  const remainingBlocks = await storage.getBlocksByPage(block.pageId);
  for (let i = 0; i < remainingBlocks.length; i++) {
    if (remainingBlocks[i].order !== i) {
      await storage.updateBlock(remainingBlocks[i].id, {
        order: i,
        version: remainingBlocks[i].version + 1,
      });
    }
  }

  return true;
}

export async function reorderBlocks(pageId: string, input: ReorderBlocksInput): Promise<Block[]> {
  const existingBlocks = await storage.getBlocksByPage(pageId);

  // Validate that all block IDs exist and belong to this page
  const existingIds = new Set(existingBlocks.map((b) => b.id));
  for (const id of input.blockIds) {
    if (!existingIds.has(id)) {
      throw new Error(`Block ${id} not found in page ${pageId}`);
    }
  }

  // Update order for each block
  for (let i = 0; i < input.blockIds.length; i++) {
    const blockId = input.blockIds[i];
    const block = existingBlocks.find((b) => b.id === blockId);
    if (block && block.order !== i) {
      await storage.updateBlock(blockId, {
        order: i,
        version: block.version + 1,
      });
    }
  }

  return storage.getBlocksByPage(pageId);
}
