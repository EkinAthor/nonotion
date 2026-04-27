import type { BlockContent } from '@nonotion/shared';
import { pushEntry, makeEntryId } from './undoManager';
import type { SelectionState, UndoEntry } from './undoTypes';

const IDLE_MS = 300;
const CHAR_THRESHOLD = 30;

interface PendingGroup {
  blockId: string;
  scopeId: string;
  before: BlockContent;
  after: BlockContent;
  selectionAfter: SelectionState;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const groups = new Map<string, PendingGroup>();

function textOf(content: BlockContent): string {
  if ('text' in content) return content.text;
  if ('code' in content) return content.code;
  return '';
}

/**
 * Record a single text edit into the per-block group buffer. Groups merge
 * within ~300ms of each other; cross a 30-char threshold and the group flushes
 * immediately. The first call for a given block seeds `before`; subsequent
 * calls only update `after` and the trailing selection.
 */
export function noteTextEdit(params: {
  blockId: string;
  scopeId: string;
  before: BlockContent;
  after: BlockContent;
  selectionAfter: SelectionState;
}): void {
  const { blockId, scopeId, before, after, selectionAfter } = params;

  let group = groups.get(blockId);
  if (!group) {
    group = {
      blockId,
      scopeId,
      before,
      after,
      selectionAfter,
      flushTimer: null,
    };
    groups.set(blockId, group);
  } else {
    group.after = after;
    group.selectionAfter = selectionAfter;
  }

  if (group.flushTimer) clearTimeout(group.flushTimer);
  group.flushTimer = setTimeout(() => flushTextGroup(blockId), IDLE_MS);

  const charsTyped = Math.abs(textOf(group.after).length - textOf(group.before).length);
  if (charsTyped >= CHAR_THRESHOLD) {
    flushTextGroup(blockId);
  }
}

/**
 * Flush the pending text group for a block as a single block.content entry.
 * No-op if no group exists or the before/after content is identical.
 */
export function flushTextGroup(blockId: string): void {
  const group = groups.get(blockId);
  if (!group) return;
  if (group.flushTimer) clearTimeout(group.flushTimer);
  groups.delete(blockId);

  if (textOf(group.before) === textOf(group.after)) return;

  const entry: UndoEntry = {
    id: makeEntryId(),
    scopeId: group.scopeId,
    payload: {
      kind: 'block.content',
      blockId,
      before: group.before,
      after: group.after,
    },
    label: 'type',
    timestamp: Date.now(),
    groupKey: `text:${blockId}`,
    selectionBefore: { kind: 'block-focus', blockId, position: 'end' },
    selectionAfter: group.selectionAfter,
  };
  pushEntry(entry.scopeId, entry);
}

/**
 * Flush every pending text group. Called by structural mutations and by the
 * undo/redo handler so a Ctrl+Z press captures any in-flight typing first.
 */
export function flushAllTextGroups(): void {
  const ids = Array.from(groups.keys());
  for (const id of ids) flushTextGroup(id);
}

/**
 * Drop the pending text group for a block WITHOUT pushing an entry. Used by
 * slash command and markdown-shortcut paths where the typed prefix is meant
 * to be consumed by the type change, not recorded as undoable text.
 */
export function discardTextGroup(blockId: string): void {
  const group = groups.get(blockId);
  if (!group) return;
  if (group.flushTimer) clearTimeout(group.flushTimer);
  groups.delete(blockId);
}
