import type { BlockContent, BlockType } from '@nonotion/shared';
import { useBlockStore, type FocusPosition } from '@/stores/blockStore';
import { getEditors } from '@/stores/editorRegistry';

// Document-wide undo/redo for the page canvas. Per-page stacks of inverse-able
// steps recorded by blockStore's local mutations (remote/realtime paths never
// record). Lives above the API-client boundary, so demo mode works unchanged.
//
// Invariant: before any structural step is recorded, open typing bursts are
// flushed (registered by useBlockEditor/CodeBlockEdit), which force-saves the
// editor content to the store — so structural before-snapshots are fresh.

export interface BlockSnapshot {
  id: string;
  pageId: string;
  type: BlockType;
  content: BlockContent;
  order: number;
}

export type UndoStep =
  // HTML text (or raw code string for code_block) before/after a typing burst
  | { kind: 'text_edit'; blockId: string; before: string; after: string }
  | { kind: 'create'; blockId: string; snapshot: BlockSnapshot }
  | { kind: 'delete'; blockId: string; snapshot: BlockSnapshot; orderedIdsBefore: string[] }
  | { kind: 'content_set'; blockId: string; before: BlockContent; after: BlockContent }
  | {
      kind: 'type_change';
      blockId: string;
      before: { type: BlockType; content: BlockContent };
      after: { type: BlockType; content: BlockContent };
    }
  | { kind: 'reorder'; pageId: string; beforeIds: string[]; afterIds: string[] };

interface FocusRef {
  blockId: string;
  position: FocusPosition;
}

export interface UndoEntry {
  pageId: string;
  steps: UndoStep[];
  focusBefore?: FocusRef;
  focusAfter?: FocusRef;
}

const MAX_ENTRIES = 100;

interface PageStacks {
  undo: UndoEntry[];
  redo: UndoEntry[];
}

const stacks = new Map<string, PageStacks>();
// Recreating a deleted block mints a new store id; old ids in older entries
// resolve through this chain at apply time.
const idRemap = new Map<string, string>();
const burstFlushers = new Map<string, () => void>();
const applyQueues = new Map<string, Promise<void>>();

let applying = false;
let openGroup: { pageId: string; steps: UndoStep[]; focusBefore?: FocusRef } | null = null;
let groupDepth = 0;

function getStacks(pageId: string): PageStacks {
  let s = stacks.get(pageId);
  if (!s) {
    s = { undo: [], redo: [] };
    stacks.set(pageId, s);
  }
  return s;
}

function captureFocus(): FocusRef | undefined {
  for (const [blockId, editor] of getEditors()) {
    if (editor.isFocused) {
      return { blockId, position: editor.state.selection.from };
    }
  }
  return undefined;
}

function getEditableText(content: BlockContent): string | null {
  if ('text' in content) return content.text;
  if ('code' in content) return content.code;
  return null;
}

function withEditableText(content: BlockContent, value: string): BlockContent {
  if ('code' in content) return { ...content, code: value };
  return { ...(content as { text: string }), text: value };
}

function sameContent(a: BlockContent, b: BlockContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pushEntry(entry: UndoEntry): void {
  const s = getStacks(entry.pageId);
  s.undo.push(entry);
  if (s.undo.length > MAX_ENTRIES) s.undo.shift();
  s.redo = [];
}

function resolveIdInternal(id: string): string {
  let current = id;
  const seen = new Set<string>();
  while (idRemap.has(current) && !seen.has(current)) {
    seen.add(current);
    current = idRemap.get(current)!;
  }
  return current;
}

/**
 * Applies one step in the given direction. Conflict rule: if the block's
 * current state no longer matches the step's expected state (remote edit,
 * failed create), the step is skipped silently — never clobber others' work.
 * Returns the ordering to restore after all steps (for delete-undo), if any.
 */
async function applyStep(step: UndoStep, direction: 'undo' | 'redo'): Promise<string[] | null> {
  const store = useBlockStore.getState();
  const skip = { history: 'skip' as const };

  switch (step.kind) {
    case 'text_edit': {
      const id = resolveIdInternal(step.blockId);
      const block = store.getBlockById(id);
      if (!block) return null;
      const currentText = getEditableText(block.content);
      const expected = direction === 'undo' ? step.after : step.before;
      const target = direction === 'undo' ? step.before : step.after;
      if (currentText === null || currentText !== expected) return null;
      await store.updateBlock(id, { content: withEditableText(block.content, target) }, skip);
      return null;
    }

    case 'create': {
      if (direction === 'undo') {
        const id = resolveIdInternal(step.blockId);
        if (!store.getBlockById(id)) return null;
        await store.deleteBlock(id, skip);
        return null;
      }
      // redo: re-create from snapshot (mints a new id)
      const snap = step.snapshot;
      const block = await store.createBlock(
        snap.pageId,
        snap.type,
        structuredClone(snap.content),
        snap.order,
        skip
      );
      idRemap.set(resolveIdInternal(step.blockId), block.id);
      return null;
    }

    case 'delete': {
      if (direction === 'redo') {
        const id = resolveIdInternal(step.blockId);
        if (!store.getBlockById(id)) return null;
        await store.deleteBlock(id, skip);
        return null;
      }
      // undo: restore from snapshot, then caller restores page ordering
      const snap = step.snapshot;
      const block = await store.createBlock(
        snap.pageId,
        snap.type,
        structuredClone(snap.content),
        snap.order,
        skip
      );
      idRemap.set(resolveIdInternal(step.blockId), block.id);
      return step.orderedIdsBefore;
    }

    case 'content_set': {
      const id = resolveIdInternal(step.blockId);
      const block = store.getBlockById(id);
      if (!block) return null;
      const expected = direction === 'undo' ? step.after : step.before;
      const target = direction === 'undo' ? step.before : step.after;
      if (!sameContent(block.content, expected)) return null;
      await store.updateBlock(id, { content: structuredClone(target) }, skip);
      return null;
    }

    case 'type_change': {
      const id = resolveIdInternal(step.blockId);
      const block = store.getBlockById(id);
      if (!block) return null;
      const expected = direction === 'undo' ? step.after : step.before;
      const target = direction === 'undo' ? step.before : step.after;
      if (block.type !== expected.type || !sameContent(block.content, expected.content)) return null;
      await store.updateBlock(
        id,
        { type: target.type, content: structuredClone(target.content) },
        skip
      );
      return null;
    }

    case 'reorder': {
      const targetIds = direction === 'undo' ? step.beforeIds : step.afterIds;
      await restoreOrdering(step.pageId, targetIds);
      return null;
    }
  }
}

/** Reorders the page to match targetIds (resolved + filtered to existing blocks; unknown current blocks appended). */
async function restoreOrdering(pageId: string, targetIds: string[]): Promise<void> {
  const store = useBlockStore.getState();
  const currentIds = store.getBlocksForPage(pageId).map((b) => b.id);
  const currentSet = new Set(currentIds);
  const desired = targetIds.map(resolveIdInternal).filter((id) => currentSet.has(id));
  const desiredSet = new Set(desired);
  const extras = currentIds.filter((id) => !desiredSet.has(id));
  const finalOrder = [...desired, ...extras];
  if (finalOrder.length === 0) return;
  if (finalOrder.join('\n') === currentIds.join('\n')) return;
  await store.reorderBlocks(pageId, finalOrder, { history: 'skip' });
}

async function applyEntry(entry: UndoEntry, direction: 'undo' | 'redo'): Promise<void> {
  const steps = direction === 'undo' ? [...entry.steps].reverse() : entry.steps;
  let orderingToRestore: string[] | null = null;

  applying = true;
  try {
    for (const step of steps) {
      try {
        const ordering = await applyStep(step, direction);
        // First recorded delete step carries the fullest pre-delete ordering;
        // in undo (reversed) it's applied last, so keep the latest non-null.
        if (ordering) orderingToRestore = ordering;
      } catch (error) {
        console.error('Undo step failed, skipping:', step.kind, error);
      }
    }
    if (direction === 'undo' && orderingToRestore) {
      try {
        await restoreOrdering(entry.pageId, orderingToRestore);
      } catch (error) {
        console.error('Undo ordering restore failed:', error);
      }
    }
  } finally {
    applying = false;
  }

  // Restore focus/caret near the affected content
  const focusRef = direction === 'undo' ? entry.focusBefore : (entry.focusAfter ?? entry.focusBefore);
  if (focusRef) {
    const store = useBlockStore.getState();
    const id = resolveIdInternal(focusRef.blockId);
    if (store.getBlockById(id)) {
      store.setFocusBlock(id, focusRef.position);
    }
  }
}

function enqueue(pageId: string, job: () => Promise<void>): Promise<void> {
  const prev = applyQueues.get(pageId) ?? Promise.resolve();
  const next = prev.then(job).catch((error) => {
    console.error('Undo/redo application failed:', error);
  });
  applyQueues.set(pageId, next);
  return next;
}

export const undoManager = {
  isApplying(): boolean {
    return applying;
  },

  resolveId(id: string): string {
    return resolveIdInternal(id);
  },

  mapId(oldId: string, newId: string): void {
    idRemap.set(oldId, newId);
  },

  registerBurstFlusher(blockId: string, flush: () => void): void {
    burstFlushers.set(blockId, flush);
  },

  unregisterBurstFlusher(blockId: string): void {
    burstFlushers.delete(blockId);
  },

  /** Commits every open typing burst (each flusher is a cheap no-op when idle). */
  flushBursts(): void {
    for (const flush of Array.from(burstFlushers.values())) {
      try {
        flush();
      } catch (error) {
        console.error('Burst flush failed:', error);
      }
    }
  },

  record(step: UndoStep, pageId: string): void {
    if (applying) return;
    // Structural steps must see fresh store content; the flush also commits
    // the preceding typing burst as its own earlier entry. (transact() already
    // flushed for grouped steps; text_edit records come FROM the flushers.)
    if (step.kind !== 'text_edit' && !openGroup) {
      this.flushBursts();
    }
    if (openGroup) {
      if (openGroup.pageId === pageId) {
        openGroup.steps.push(step);
        return;
      }
      // Different page mid-group — record standalone (shouldn't happen)
    }
    pushEntry({ pageId, steps: [step], focusBefore: captureFocus() });
  },

  /** Groups every step recorded inside fn into a single undo entry. */
  async transact<T>(pageId: string, fn: () => T | Promise<T>): Promise<T> {
    if (!applying && groupDepth === 0) {
      this.flushBursts();
      openGroup = { pageId, steps: [], focusBefore: captureFocus() };
    }
    groupDepth++;
    try {
      return await fn();
    } finally {
      groupDepth--;
      if (groupDepth === 0 && openGroup) {
        const group = openGroup;
        openGroup = null;
        if (group.steps.length > 0) {
          pushEntry({ pageId: group.pageId, steps: group.steps, focusBefore: group.focusBefore });
        }
      }
    }
  },

  undo(pageId: string): Promise<void> {
    return enqueue(pageId, async () => {
      this.flushBursts();
      const s = getStacks(pageId);
      const entry = s.undo.pop();
      if (!entry) return;
      entry.focusAfter = entry.focusAfter ?? captureFocus();
      await applyEntry(entry, 'undo');
      s.redo.push(entry);
    });
  },

  redo(pageId: string): Promise<void> {
    return enqueue(pageId, async () => {
      this.flushBursts();
      const s = getStacks(pageId);
      const entry = s.redo.pop();
      if (!entry) return;
      await applyEntry(entry, 'redo');
      s.undo.push(entry);
    });
  },

  canUndo(pageId: string): boolean {
    return (stacks.get(pageId)?.undo.length ?? 0) > 0;
  },

  canRedo(pageId: string): boolean {
    return (stacks.get(pageId)?.redo.length ?? 0) > 0;
  },

  clearPage(pageId: string): void {
    stacks.delete(pageId);
    applyQueues.delete(pageId);
    // idRemap entries are kept: they're tiny and other pages' entries never
    // reference this page's blocks. Flushers unregister with their editors.
  },
};

// Dev-only introspection for debugging/automated verification
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__undoDebug = {
    stacks: (pageId: string) => {
      const s = stacks.get(pageId);
      return {
        undo: s?.undo.map((e) => e.steps.map((st) => st.kind)) ?? [],
        redo: s?.redo.map((e) => e.steps.map((st) => st.kind)) ?? [],
      };
    },
    detail: (pageId: string) => {
      const s = stacks.get(pageId);
      return {
        undo: s?.undo.map((e) => e.steps) ?? [],
        redo: s?.redo.map((e) => e.steps) ?? [],
        remap: Object.fromEntries(idRemap),
        storeIds: useBlockStore
          .getState()
          .getBlocksForPage(pageId)
          .map((b) => `${b.id}:${b.order}`),
      };
    },
  };
}
