import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { EmojiData, EmojiItem } from '@/lib/emoji/emoji-data';
import { loadEmojiData, searchEmoji } from '@/lib/emoji/emoji-data';
import { getEmojiUsage, getMostUsedEmojiIds } from '@/lib/emoji/emoji-usage';

interface EmojiPickerPopoverProps {
  onSelect: (item: EmojiItem) => void;
  /** Renders a "Remove icon" row when provided */
  onRemove?: () => void;
  onClose: () => void;
  /** Anchor (toggle button) excluded from click-outside so it can toggle */
  anchorRef?: RefObject<HTMLElement>;
}

const MOST_USED_COUNT = 16;
const SEARCH_LIMIT = 120;

/**
 * Button-anchored emoji picker with its own search input — used for the page
 * icon. Unlike the caret-anchored EmojiMenu, this popover takes real focus.
 * Rendered inside a `relative` wrapper (absolute positioning, not portaled).
 */
export default function EmojiPickerPopover({
  onSelect,
  onRemove,
  onClose,
  anchorRef,
}: EmojiPickerPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<EmojiData | null>(null);
  const [query, setQuery] = useState('');
  const [usage] = useState(() => getEmojiUsage());

  useEffect(() => {
    let cancelled = false;
    loadEmojiData()
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch(() => {
        // Data chunk failed to load — leave the "Loading" state
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close when clicking outside the popover (and outside the toggle button)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  const trimmedQuery = query.trim();

  const searchResults = useMemo<EmojiItem[]>(
    () => (data && trimmedQuery ? searchEmoji(data, trimmedQuery, SEARCH_LIMIT, usage) : []),
    [data, trimmedQuery, usage]
  );

  const mostUsed = useMemo<EmojiItem[]>(() => {
    if (!data) return [];
    const items = getMostUsedEmojiIds(MOST_USED_COUNT)
      .map((id) => data.byId.get(id))
      .filter((item): item is EmojiItem => !!item);
    // Pad from the first category so the section never looks empty
    for (const item of data.categories[0]?.items ?? []) {
      if (items.length >= MOST_USED_COUNT) break;
      if (!items.some((i) => i.id === item.id)) items.push(item);
    }
    return items;
  }, [data]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && trimmedQuery && searchResults[0]) {
      e.preventDefault();
      onSelect(searchResults[0]);
    }
  };

  const renderGrid = (items: EmojiItem[]) => (
    <div className="grid grid-cols-8 gap-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item)}
          title={item.name}
          className="text-xl p-1 hover:bg-notion-hover rounded"
        >
          {item.char}
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={containerRef}
      data-emoji-picker
      className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-notion-border z-10 w-80"
    >
      <div className="p-2 border-b border-notion-border">
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search emoji..."
          className="w-full px-2 py-1 text-sm border border-notion-border rounded outline-none focus:border-blue-400"
        />
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {!data ? (
          <div className="px-1 py-2 text-sm text-notion-text-secondary">Loading emoji…</div>
        ) : trimmedQuery ? (
          searchResults.length > 0 ? (
            renderGrid(searchResults)
          ) : (
            <div className="px-1 py-2 text-sm text-notion-text-secondary">No results</div>
          )
        ) : (
          <>
            <div className="text-xs text-notion-text-secondary px-1 pb-1">Most used</div>
            {renderGrid(mostUsed)}
            {data.categories.map((category) => (
              <div key={category.id}>
                <div className="text-xs text-notion-text-secondary px-1 pt-2 pb-1">
                  {category.label}
                </div>
                {renderGrid(category.items)}
              </div>
            ))}
          </>
        )}
      </div>

      {onRemove && (
        <div className="p-2 border-t border-notion-border">
          <button
            onClick={onRemove}
            className="w-full px-2 py-1 text-sm text-notion-text-secondary hover:bg-notion-hover rounded text-left"
          >
            Remove icon
          </button>
        </div>
      )}
    </div>
  );
}
