import { useState, useEffect, useRef, useCallback } from 'react';
import type { BlockType } from '@nonotion/shared';
import { getAllBlockTypes, type BlockDefinition } from './registry';

interface SlashCommandMenuProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

export default function SlashCommandMenu({
  query,
  position,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter options based on query (matches label, type, or shortcuts)
  const allOptions = getAllBlockTypes();
  const queryLower = query.toLowerCase();
  const filteredOptions = query
    ? allOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(queryLower) ||
        opt.type.toLowerCase().includes(queryLower) ||
        opt.shortcuts.some((s) => s.startsWith(queryLower))
    )
    : allOptions;

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
            onSelect(filteredOptions[selectedIndex].type);
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

  if (filteredOptions.length === 0) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-white rounded-lg shadow-lg border border-notion-border py-2 min-w-[200px]"
        style={{ top: position.top, left: position.left }}
      >
        <div className="px-3 py-2 text-sm text-notion-text-secondary">
          No results
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-notion-border py-1 min-w-[200px]"
      style={{ top: position.top, left: position.left }}
    >
      <div className="text-xs text-notion-text-secondary px-3 py-1 border-b border-notion-border mb-1">
        Basic blocks
      </div>
      {filteredOptions.map((option, index) => (
        <button
          key={option.type}
          onClick={() => onSelect(option.type)}
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
              {getBlockDescription(option)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function getBlockDescription(option: BlockDefinition): string {
  switch (option.type) {
    case 'heading':
      return 'Large section heading';
    case 'heading2':
      return 'Medium section heading';
    case 'heading3':
      return 'Small section heading';
    case 'paragraph':
      return 'Plain text';
    case 'bullet_list':
      return 'Simple bulleted list';
    case 'numbered_list':
      return 'Numbered list';
    case 'checklist':
      return 'Track tasks with a to-do list';
    case 'code_block':
      return 'Capture code snippet';
    case 'image':
      return 'Upload or embed an image';
    default:
      return '';
  }
}
