import { useState } from 'react';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import ConfirmDialog from '@/components/common/ConfirmDialog';

/**
 * Action bar shown above the table view when one or more rows are selected.
 * Currently offers bulk delete; future bulk actions (move, export) live here.
 */
export default function DatabaseSelectionBar() {
  const { rows, total, selectedRowIds, selectAllAcross, toggleSelectAll, clearSelection, deleteSelectedRows } = useDatabaseInstance();
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedCount = selectAllAcross ? total : selectedRowIds.size;
  if (selectedCount === 0) return null;

  // Offer "select all N" escalation when every loaded row is picked but more exist on other pages.
  const canEscalate = !selectAllAcross && selectedRowIds.size === rows.length && rows.length < total;

  const handleConfirmDelete = async () => {
    setBusy(true);
    try {
      await deleteSelectedRows();
      setShowConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2 border-b border-notion-border bg-blue-50 text-sm">
        <button
          onClick={clearSelection}
          className="p-1 rounded hover:bg-blue-100 text-notion-text-secondary"
          title="Clear selection"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <span className="font-medium text-notion-text">
          {selectedCount} selected
        </span>

        {canEscalate && (
          <button
            onClick={toggleSelectAll}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Select all {total}
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setShowConfirm(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-red-600 hover:bg-red-100"
          title="Delete selected rows"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title={`Delete ${selectedCount} ${selectedCount === 1 ? 'row' : 'rows'}?`}
        message={
          <>
            This permanently deletes the selected {selectedCount === 1 ? 'page' : 'pages'} and{' '}
            {selectedCount === 1 ? 'its' : 'their'} content. This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
