import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { mcpApi } from '@/api/client';

interface McpAccessPopoverProps {
  databaseId: string;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Called after any change so the anchor can refresh its enabled indicator. */
  onChanged?: (enabled: boolean) => void;
}

/**
 * Per-user MCP access settings for one database: master toggle + content
 * options. Enabling requires only read access — each user curates their own
 * MCP surface.
 */
export default function McpAccessPopover({ databaseId, onClose, anchorRef, onChanged }: McpAccessPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [allowImages, setAllowImages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popoverHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= popoverHeight ? rect.bottom + 4 : Math.max(8, rect.top - popoverHeight - 4);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 320));
    setPosition({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, anchorRef]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const access = await mcpApi.getAccess(databaseId);
        if (cancelled) return;
        setEnabled(access?.enabled ?? false);
        setAllowImages(access?.allowImages ?? false);
      } catch {
        if (!cancelled) setError('Failed to load MCP settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [databaseId]);

  // Optimistic save: flip local state immediately, revert on error.
  const save = async (nextEnabled: boolean, nextAllowImages: boolean) => {
    const prev = { enabled, allowImages };
    setEnabled(nextEnabled);
    setAllowImages(nextAllowImages);
    setError(null);
    try {
      await mcpApi.setAccess(databaseId, { enabled: nextEnabled, allowImages: nextAllowImages });
      onChanged?.(nextEnabled);
    } catch (err) {
      setEnabled(prev.enabled);
      setAllowImages(prev.allowImages);
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (!position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed bg-white border border-notion-border rounded-md shadow-lg z-[100] w-[300px]"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-2 text-xs font-medium text-notion-text-secondary uppercase border-b border-notion-border">
        Claude / MCP access
      </div>
      <div className="p-3 space-y-3">
        {loading ? (
          <p className="text-sm text-notion-text-secondary">Loading…</p>
        ) : (
          <>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-sm text-notion-text">Available to Claude via MCP</div>
                <div className="text-xs text-notion-text-secondary mt-0.5">
                  Read-only access for your connected MCP clients
                </div>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => save(e.target.checked, allowImages)}
                className="h-4 w-4 shrink-0 accent-blue-600"
              />
            </label>

            <label
              className={`flex items-center justify-between gap-3 ${
                enabled ? 'cursor-pointer' : 'opacity-50'
              }`}
            >
              <div>
                <div className="text-sm text-notion-text">Allow image access</div>
                <div className="text-xs text-notion-text-secondary mt-0.5">
                  Let clients fetch images embedded in pages
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowImages}
                disabled={!enabled}
                onChange={(e) => save(enabled, e.target.checked)}
                className="h-4 w-4 shrink-0 accent-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 opacity-50" title="File uploads are currently images-only; this option becomes available when other file types are supported">
              <div>
                <div className="text-sm text-notion-text">Allow file access</div>
                <div className="text-xs text-notion-text-secondary mt-0.5">
                  Uploads are currently images-only
                </div>
              </div>
              <input type="checkbox" checked={false} disabled className="h-4 w-4 shrink-0" />
            </label>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
