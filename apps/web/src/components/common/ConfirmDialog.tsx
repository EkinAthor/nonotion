import { useEffect } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm button uses a destructive (red) style. */
  destructive?: boolean;
  /** When true, disables buttons and shows a busy label on confirm. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Generic confirmation modal. Backdrop click and Escape both cancel.
 * Used for destructive actions (page/row deletion) in place of native confirm().
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, busy, onCancel]);

  if (!isOpen) return null;

  const confirmClasses = destructive
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-blue-600 text-white hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={busy ? undefined : onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-xl">
        <div className="px-6 py-4 border-b border-notion-border">
          <h2 className="text-lg font-semibold text-notion-text">{title}</h2>
        </div>

        <div className="px-6 py-4 text-sm text-notion-text-secondary">
          {message}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-notion-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-notion-text-secondary hover:bg-notion-hover rounded-md disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
