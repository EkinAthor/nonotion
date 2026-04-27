import type { BlockContent, BlockType } from '@nonotion/shared';
import { pushEntry, makeEntryId, isApplying } from './undoManager';
import type { SelectionState, UndoEntry } from './undoTypes';

/**
 * Push a block.content undo entry. Use for non-typed content changes —
 * checklist toggle, list indent/outdent, merge-into-previous block — where
 * the textGroupBuffer isn't capturing the change.
 */
export function pushBlockContentEntry(params: {
  blockId: string;
  pageId: string;
  before: BlockContent;
  after: BlockContent;
  label: string;
  selectionBefore?: SelectionState;
  selectionAfter?: SelectionState;
}): void {
  if (isApplying()) return;
  const { blockId, pageId, before, after, label, selectionBefore, selectionAfter } = params;
  const entry: UndoEntry = {
    id: makeEntryId(),
    scopeId: `page:${pageId}`,
    payload: { kind: 'block.content', blockId, before, after },
    label,
    timestamp: Date.now(),
    selectionBefore: selectionBefore ?? { kind: 'block-focus', blockId, position: 'end' },
    selectionAfter: selectionAfter ?? { kind: 'block-focus', blockId, position: 'end' },
  };
  pushEntry(entry.scopeId, entry);
}

/**
 * Push a block.changeType entry. Called from the changeBlockType store action.
 */
export function pushBlockChangeTypeEntry(params: {
  blockId: string;
  pageId: string;
  before: { type: BlockType; content: BlockContent };
  after: { type: BlockType; content: BlockContent };
  selectionBefore?: SelectionState;
  selectionAfter?: SelectionState;
}): void {
  if (isApplying()) return;
  const { blockId, pageId, before, after, selectionBefore, selectionAfter } = params;
  const entry: UndoEntry = {
    id: makeEntryId(),
    scopeId: `page:${pageId}`,
    payload: { kind: 'block.changeType', blockId, before, after },
    label: 'change block type',
    timestamp: Date.now(),
    selectionBefore: selectionBefore ?? { kind: 'block-focus', blockId, position: 'end' },
    selectionAfter: selectionAfter ?? { kind: 'block-focus', blockId, position: 'end' },
  };
  pushEntry(entry.scopeId, entry);
}
