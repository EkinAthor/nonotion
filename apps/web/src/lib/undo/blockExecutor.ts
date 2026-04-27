import { useBlockStore } from '@/stores/blockStore';
import { getEditor } from '@/stores/editorRegistry';
import type { Executor, SelectionState, UndoEntry } from './undoTypes';
import { registerExecutor } from './undoManager';

const blockKinds = new Set([
  'block.create',
  'block.delete',
  'block.reorder',
  'block.content',
  'block.changeType',
]);

const blockExecutor: Executor = {
  matches(entry: UndoEntry): boolean {
    return blockKinds.has(entry.payload.kind);
  },
  async apply(entry: UndoEntry, direction: 'undo' | 'redo'): Promise<void> {
    const store = useBlockStore.getState();

    switch (entry.payload.kind) {
      case 'block.create': {
        const { block } = entry.payload;
        if (direction === 'undo') {
          store.deleteBlock(block.id);
        } else {
          await store.recreateBlock(block);
        }
        break;
      }
      case 'block.delete': {
        const { block } = entry.payload;
        if (direction === 'undo') {
          await store.recreateBlock(block);
        } else {
          store.deleteBlock(block.id);
        }
        break;
      }
      case 'block.reorder': {
        const { pageId, beforeIds, afterIds } = entry.payload;
        const target = direction === 'undo' ? beforeIds : afterIds;
        await store.reorderBlocks(pageId, target);
        break;
      }
      case 'block.content': {
        const { blockId, before, after } = entry.payload;
        const target = direction === 'undo' ? before : after;
        // Store update; the editor's React sync effect picks up the change
        // and re-renders content under isSyncingExternalContent protection.
        await store.updateBlock(blockId, { content: target });
        break;
      }
      case 'block.changeType': {
        const { blockId, before, after } = entry.payload;
        const target = direction === 'undo' ? before : after;
        await store.updateBlock(blockId, { type: target.type, content: target.content });
        break;
      }
    }

    // Restore selection / focus after the mutation has applied.
    const target = direction === 'undo' ? entry.selectionBefore : entry.selectionAfter;
    restoreSelection(target);
  },
};

function restoreSelection(selection: SelectionState): void {
  if (!selection) return;
  // Defer one frame so the DOM reflects the mutation before we focus.
  requestAnimationFrame(() => {
    if (selection.kind === 'tiptap') {
      const editor = getEditor(selection.blockId);
      if (editor) {
        editor.commands.focus();
        editor.commands.setTextSelection({ from: selection.from, to: selection.to });
        return;
      }
      // Editor not mounted yet — fall back to block focus.
      useBlockStore.getState().setFocusBlock(selection.blockId, selection.from);
      return;
    }
    if (selection.kind === 'block-focus') {
      useBlockStore.getState().setFocusBlock(selection.blockId, selection.position ?? 'end');
    }
  });
}

registerExecutor(blockExecutor);
