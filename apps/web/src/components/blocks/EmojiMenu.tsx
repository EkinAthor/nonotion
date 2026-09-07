import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { EmojiData, EmojiItem } from '@/lib/emoji/emoji-data';
import { loadEmojiData, searchEmoji } from '@/lib/emoji/emoji-data';
import type { EmojiUsageEntry } from '@/lib/emoji/emoji-usage';
import { getEmojiUsage } from '@/lib/emoji/emoji-usage';

interface EmojiMenuProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (item: EmojiItem) => void;
  onClose: () => void;
}

const MENU_MAX_HEIGHT = 320;
const MAX_RESULTS = 50;

/**
 * Inline ":" emoji menu — a searchable list of the standard emoji set. Same
 * caret-anchored portal mechanics as MentionMenu (the editor keeps focus; a
 * document-level keydown listener navigates). Zero matches auto-close the
 * menu so emoticons like ":-)" never leave a dead box behind.
 */
export default function EmojiMenu({ query, position, onSelect, onClose }: EmojiMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [data, setData] = useState<EmojiData | null>(null);
  const [usage] = useState<Map<string, EmojiUsageEntry>>(() => getEmojiUsage());

  useEffect(() => {
    let cancelled = false;
    loadEmojiData()
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch(() => {
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo<EmojiItem[]>(
    () => (data ? searchEmoji(data, query, MAX_RESULTS, usage) : []),
    [data, query, usage]
  );

  // Zero matches → close (leaves the typed text as-is). No reopen loop: the
  // trigger's open regex only fires when the caret is exactly one char past
  // the colon.
  useEffect(() => {
    if (data && results.length === 0) onClose();
  }, [data, results.length, onClose]);

  // Positioning — same below/above flip as MentionMenu, anchored to the caret
  const computePosition = useCallback(() => {
    const estimatedHeight = menuRef.current?.offsetHeight ?? MENU_MAX_HEIGHT;
    const left = Math.min(position.left, window.innerWidth - 280);
    const spaceBelow = window.innerHeight - position.top - 8;

    if (spaceBelow >= estimatedHeight || spaceBelow >= MENU_MAX_HEIGHT) {
      setMenuStyle({ position: 'fixed', top: position.top, left, bottom: 'auto' });
    } else {
      const anchorBottom = window.innerHeight - position.top + 24;
      setMenuStyle({ position: 'fixed', top: 'auto', bottom: Math.max(8, anchorBottom), left });
    }
  }, [position]);

  useLayoutEffect(() => {
    computePosition();
  }, [computePosition, results.length]);

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const handleScroll = () => computePosition();
    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [computePosition]);

  // Reset selection when the result set changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, results.length]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            onSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close when clicking outside the menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const selected = menuRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const menuContent = (
    <div
      ref={menuRef}
      data-emoji-menu
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-notion-border py-1 min-w-[240px] max-w-[320px] max-h-[320px] overflow-y-auto"
      style={menuStyle}
      // Keep focus in the anchoring input/editor when clicking a row — a blur
      // would save/unmount the page-title input before onSelect fires
      onMouseDown={(e) => e.preventDefault()}
    >
      {!data && (
        <div className="px-3 py-2 text-sm text-notion-text-secondary">Loading emoji…</div>
      )}
      {results.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <button
            key={item.id}
            data-selected={isSelected}
            onClick={() => onSelect(item)}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
              isSelected ? 'bg-notion-hover' : 'hover:bg-notion-hover'
            }`}
          >
            <span className="w-6 h-6 flex items-center justify-center text-xl shrink-0">
              {item.char}
            </span>
            <span className="text-sm text-notion-text truncate">{item.name}</span>
            <span className="text-xs text-notion-text-secondary truncate ml-auto">
              :{item.id}:
            </span>
          </button>
        );
      })}
    </div>
  );

  return createPortal(menuContent, document.body);
}
