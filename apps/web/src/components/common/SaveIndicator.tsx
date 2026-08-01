import { useEffect, useRef, useState } from 'react';
import {
  useSaveStatusStore,
  selectSaveStatus,
  type SaveStatus,
} from '@/stores/saveStatusStore';

const MIN_SAVING_VISIBLE_MS = 300;

// Holds 'saving' on screen for a minimum duration so near-instant saves (demo
// mode, fast API) don't flash. Only the saving -> saved transition is held;
// error and offline always show immediately.
function useDisplayStatus(status: SaveStatus): SaveStatus {
  const [display, setDisplay] = useState(status);
  const savingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (status === 'saving') {
      if (savingSinceRef.current === null) savingSinceRef.current = Date.now();
      setDisplay('saving');
      return;
    }
    if (status === 'saved' && savingSinceRef.current !== null) {
      const remaining = MIN_SAVING_VISIBLE_MS - (Date.now() - savingSinceRef.current);
      if (remaining > 0) {
        const timer = setTimeout(() => {
          savingSinceRef.current = null;
          setDisplay('saved');
        }, remaining);
        return () => clearTimeout(timer);
      }
    }
    savingSinceRef.current = null;
    setDisplay(status);
  }, [status]);

  return display;
}

const STATUS_CONFIG: Record<SaveStatus, { dot: string; label: string }> = {
  saved: { dot: 'bg-green-500', label: 'Saved' },
  saving: { dot: 'bg-blue-400 animate-pulse', label: 'Saving…' },
  error: { dot: 'bg-red-500', label: 'Save failed' },
  offline: { dot: 'bg-amber-500', label: 'Offline' },
};

export default function SaveIndicator() {
  const status = useSaveStatusStore(selectSaveStatus);
  const errorMessage = useSaveStatusStore((s) => s.lastError?.message);
  const display = useDisplayStatus(status);
  const { dot, label } = STATUS_CONFIG[display];

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-notion-text-secondary select-none"
      title={display === 'error' ? `Save failed: ${errorMessage ?? 'Unknown error'}` : label}
      data-save-status={display}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
