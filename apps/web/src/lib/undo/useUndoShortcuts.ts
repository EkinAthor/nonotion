import { useEffect } from 'react';
import { usePageStore } from '@/stores/pageStore';
import { undo, redo } from './undoManager';
import { flushAllTextGroups } from './textGroupBuffer';
// Side-effect import: registers the block executor.
import './blockExecutor';

/**
 * Walks up from the active element to find the nearest [data-undo-scope]
 * ancestor. Falls back to the currently open page's scope.
 */
function activeScope(): string | null {
  const el = document.activeElement as HTMLElement | null;
  if (el) {
    const node = el.closest('[data-undo-scope]') as HTMLElement | null;
    if (node) {
      const value = node.dataset.undoScope;
      if (value) return value;
    }
  }
  const currentPageId = usePageStore.getState().currentPageId;
  if (currentPageId) return `page:${currentPageId}`;
  return null;
}

function isUndoShortcut(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.shiftKey || e.altKey) return false;
  return e.key === 'z' || e.key === 'Z';
}

function isRedoShortcut(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return false;
  if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) return true;
  // Ctrl+Y on Windows/Linux. On Mac Cmd+Y is "Show history" in some apps; we
  // accept it here since this is an editor.
  if (!e.shiftKey && (e.key === 'y' || e.key === 'Y')) return true;
  return false;
}

export function useUndoShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const undoMatch = isUndoShortcut(e);
      const redoMatch = !undoMatch && isRedoShortcut(e);
      if (!undoMatch && !redoMatch) return;

      const scope = activeScope();
      if (!scope) return;

      e.preventDefault();
      e.stopPropagation();

      // Drain any in-flight typing into the stack before undoing — otherwise
      // the user's most recent keystrokes wouldn't be undoable yet.
      flushAllTextGroups();

      if (undoMatch) {
        void undo(scope);
      } else {
        void redo(scope);
      }
    };
    // Capture phase so we run before TipTap and other listeners.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
