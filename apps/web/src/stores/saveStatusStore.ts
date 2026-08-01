import { useEffect } from 'react';
import { create } from 'zustand';

export type SaveStatus = 'saved' | 'saving' | 'error' | 'offline';

interface SaveStatusState {
  /** In-flight tracked API mutations (see api/save-tracking.ts). */
  pendingCount: number;
  /** Block ids currently inside an autosave debounce window (typed but unsent). */
  dirtyKeys: ReadonlySet<string>;
  /** Last failed save; cleared by the next successful one. */
  lastError: { message: string; at: number } | null;
  online: boolean;

  beginSave: () => void;
  endSave: (error?: unknown) => void;
  markDirty: (key: string) => void;
  clearDirty: (key: string) => void;
  setOnline: (online: boolean) => void;
}

export const useSaveStatusStore = create<SaveStatusState>((set) => ({
  pendingCount: 0,
  dirtyKeys: new Set<string>(),
  lastError: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,

  beginSave: () => set((s) => ({ pendingCount: s.pendingCount + 1 })),

  endSave: (error) =>
    set((s) => ({
      pendingCount: Math.max(0, s.pendingCount - 1),
      lastError:
        error === undefined
          ? null
          : { message: error instanceof Error ? error.message : String(error), at: Date.now() },
    })),

  markDirty: (key) =>
    set((s) => (s.dirtyKeys.has(key) ? s : { dirtyKeys: new Set(s.dirtyKeys).add(key) })),

  clearDirty: (key) =>
    set((s) => {
      if (!s.dirtyKeys.has(key)) return s;
      const next = new Set(s.dirtyKeys);
      next.delete(key);
      return { dirtyKeys: next };
    }),

  setOnline: (online) => set({ online }),
}));

// Priority: offline > saving > error > saved. "saving" outranks "error" so a
// retry visibly shows progress; the error returns if the retry fails too.
export function selectSaveStatus(
  s: Pick<SaveStatusState, 'pendingCount' | 'dirtyKeys' | 'lastError' | 'online'>
): SaveStatus {
  if (!s.online) return 'offline';
  if (s.pendingCount > 0 || s.dirtyKeys.size > 0) return 'saving';
  if (s.lastError) return 'error';
  return 'saved';
}

// Closing the tab would lose or orphan work. Offline alone doesn't count —
// with everything persisted there is nothing to lose.
export function hasUnsavedWork(
  s: Pick<SaveStatusState, 'pendingCount' | 'dirtyKeys' | 'lastError'>
): boolean {
  return s.pendingCount > 0 || s.dirtyKeys.size > 0 || s.lastError !== null;
}

/** Mount once (MainLayout): online/offline tracking + unload warning while unsaved. */
export function useSaveStatusGlobalListeners(): void {
  useEffect(() => {
    const { setOnline } = useSaveStatusStore.getState();
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork(useSaveStatusStore.getState())) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);
}
