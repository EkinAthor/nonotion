import type { Block, BlockType } from '@nonotion/shared';

const LIST_TYPES = new Set<BlockType>(['bullet_list', 'numbered_list', 'checklist']);

export function isListBlock(type: BlockType): boolean {
  return LIST_TYPES.has(type);
}

export function getBlockIndent(block: Block): number {
  const content = block.content;
  if ('indent' in content && typeof content.indent === 'number') {
    return content.indent;
  }
  return 0;
}

/**
 * Walk forward from a list block, collecting consecutive list blocks
 * with strictly higher indent. Stop at same/lower indent or non-list block.
 */
export function getListChildren(blocks: Block[], startIndex: number): string[] {
  const parentIndent = getBlockIndent(blocks[startIndex]);
  const children: string[] = [];

  for (let i = startIndex + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (!isListBlock(block.type)) break;
    const indent = getBlockIndent(block);
    if (indent <= parentIndent) break;
    children.push(block.id);
  }

  return children;
}

/**
 * Compute the effective drag set: union of selected blocks + hierarchy children
 * for each selected list block. Returns IDs sorted by block order.
 */
export function computeDragSet(
  blocks: Block[],
  selectedBlockIds: Set<string>,
  activeId: string
): string[] {
  const isActiveSelected = selectedBlockIds.has(activeId);
  const hasMultiSelection = selectedBlockIds.size > 1;

  // Determine base set of IDs to expand
  let baseIds: Set<string>;
  if (isActiveSelected && hasMultiSelection) {
    // Dragging a selected block with multi-selection: use full selection
    baseIds = new Set(selectedBlockIds);
  } else {
    // Dragging unselected block or single-selected: just this block
    baseIds = new Set([activeId]);
  }

  // Expand list parents with their hierarchy children
  const expandedIds = new Set(baseIds);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (baseIds.has(block.id) && isListBlock(block.type)) {
      const children = getListChildren(blocks, i);
      for (const childId of children) {
        expandedIds.add(childId);
      }
    }
  }

  // Return IDs sorted by block order
  return blocks.filter(b => expandedIds.has(b.id)).map(b => b.id);
}
