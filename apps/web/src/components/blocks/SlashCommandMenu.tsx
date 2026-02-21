import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BlockType } from '@nonotion/shared';
import { getSlashMenuItems } from './registry';

interface SlashCommandMenuProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (type: BlockType, action?: string) => void;
  onClose: () => void;
}

const MENU_MAX_HEIGHT = 320;

export default function SlashCommandMenu({
  query,
  position,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  // Filter options based on query (matches label, type, or shortcuts)
  const allOptions = getSlashMenuItems();
  const queryLower = query.toLowerCase();
  const filteredOptions = query
    ? allOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(queryLower) ||
        opt.type.toLowerCase().includes(queryLower) ||
        opt.shortcuts.some((s) => s.startsWith(queryLower))
    )
    : allOptions;

  // Compute clamped position — decides below vs above and uses the right
  // CSS anchor (top for below, bottom for above) so the menu stays connected
  // to the cursor even as its height changes from filtering.
  const computePosition = useCallback(() => {
    const estimatedHeight = menuRef.current?.offsetHeight ?? MENU_MAX_HEIGHT;
    const left = Math.min(position.left, window.innerWidth - 220);

    const spaceBelow = window.innerHeight - position.top - 8;

    if (spaceBelow >= estimatedHeight || spaceBelow >= MENU_MAX_HEIGHT) {
      // Render below — anchor top edge to cursor
      setMenuStyle({
        position: 'fixed',
        top: position.top,
        left,
        bottom: 'auto',
      });
    } else {
      // Render above — anchor bottom edge to the line above the cursor.
      // position.top is the bottom of the cursor line, so the menu's bottom
      // should be at (position.top - lineHeight). Use ~24px as a line height
      // approximation.
      const anchorBottom = window.innerHeight - position.top + 24;
      setMenuStyle({
        position: 'fixed',
        top: 'auto',
        bottom: Math.max(8, anchorBottom),
        left,
      });
    }
  }, [position]);

  // Recalculate on mount and when position changes
  useLayoutEffect(() => {
    computePosition();
  }, [computePosition]);

  // Also recalculate when filtered options change (menu height changes)
  useLayoutEffect(() => {
    computePosition();
  }, [filteredOptions.length, computePosition]);

  // Listen to scroll on the main content area to reposition
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    const handleScroll = () => {
      computePosition();
    };

    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [computePosition]);

  // Reset selection when options change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredOptions[selectedIndex]) {
            onSelect(filteredOptions[selectedIndex].type, filteredOptions[selectedIndex].action);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredOptions, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current) {
      const selected = menuRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const menuContent = filteredOptions.length === 0 ? (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-notion-border py-2 min-w-[200px]"
      style={menuStyle}
    >
      <div className="px-3 py-2 text-sm text-notion-text-secondary">
        No results
      </div>
    </div>
  ) : (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-notion-border py-1 min-w-[200px] max-h-[320px] overflow-y-auto"
      style={menuStyle}
    >
      <div className="text-xs text-notion-text-secondary px-3 py-1 border-b border-notion-border mb-1">
        Basic blocks
      </div>
      {filteredOptions.map((option, index) => (
        <button
          key={option.action ? `${option.type}:${option.action}` : option.type}
          data-selected={index === selectedIndex}
          onClick={() => onSelect(option.type, option.action)}
          className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${index === selectedIndex
            ? 'bg-notion-hover'
            : 'hover:bg-notion-hover'
            }`}
        >
          <span className="w-8 h-8 flex items-center justify-center bg-notion-sidebar rounded text-sm font-medium">
            {option.icon}
          </span>
          <div>
            <div className="text-sm text-notion-text">{option.label}</div>
            <div className="text-xs text-notion-text-secondary">
              {option.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  return createPortal(menuContent, document.body);
}
