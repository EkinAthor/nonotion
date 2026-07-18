import type { Block, CreateBlockInput, UpdateBlockInput, ReorderBlocksInput } from '@nonotion/shared';
import { generateBlockId } from '@nonotion/shared';
import { getStorage } from '../storage/storage-factory.js';

export async function getBlocksByPage(pageId: string): Promise<Block[]> {
  return getStorage().getBlocksByPage(pageId);
}

export async function getBlock(id: string): Promise<Block | null> {
  return getStorage().getBlock(id);
}

export async function createBlock(input: CreateBlockInput): Promise<Block> {
  const existingBlocks = await getStorage().getBlocksByPage(input.pageId);

  // If order is not specified, add at the end
  const order = input.order ?? existingBlocks.length;

  // Shift existing blocks if inserting in the middle
  if (order < existingBlocks.length) {
    const shifts = existingBlocks
      .filter((block) => block.order >= order)
      .map((block) => ({ id: block.id, order: block.order + 1 }));
    await getStorage().updateBlockOrders(input.pageId, shifts);
  }

  const block: Block = {
    id: generateBlockId(),
    type: input.type,
    pageId: input.pageId,
    order,
    content: input.content,
    version: 1,
  };

  return getStorage().createBlock(block);
}

export async function updateBlock(id: string, input: UpdateBlockInput): Promise<Block | null> {
  const existing = await getStorage().getBlock(id);
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

  return getStorage().updateBlock(id, updates);
}

export async function deleteBlock(id: string): Promise<boolean> {
  const block = await getStorage().getBlock(id);
  if (!block) return false;

  const success = await getStorage().deleteBlock(id);
  if (!success) return false;

  // Reorder remaining blocks
  const remainingBlocks = await getStorage().getBlocksByPage(block.pageId);
  const renumbered = remainingBlocks
    .map((b, i) => ({ id: b.id, order: i, changed: b.order !== i }))
    .filter((b) => b.changed)
    .map(({ id, order }) => ({ id, order }));
  await getStorage().updateBlockOrders(block.pageId, renumbered);

  return true;
}

export async function reorderBlocks(pageId: string, input: ReorderBlocksInput): Promise<Block[]> {
  const existingBlocks = await getStorage().getBlocksByPage(pageId);

  // Validate that all block IDs exist and belong to this page
  const existingIds = new Set(existingBlocks.map((b) => b.id));
  for (const id of input.blockIds) {
    if (!existingIds.has(id)) {
      throw new Error(`Block ${id} not found in page ${pageId}`);
    }
  }

  // Batch-update changed orders atomically
  const blocksById = new Map(existingBlocks.map((b) => [b.id, b]));
  const changes = input.blockIds
    .map((id, i) => ({ id, order: i }))
    .filter(({ id, order }) => blocksById.get(id)!.order !== order);
  await getStorage().updateBlockOrders(pageId, changes);

  return getStorage().getBlocksByPage(pageId);
}
