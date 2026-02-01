import { useState, useEffect, useRef, useCallback } from 'react';
import type { BlockType } from '@nonotion/shared';
import { getAllBlockTypes } from './registry';

interface BlockContextMenuProps {
  currentBlockType: BlockType;
  position: { top: number; left: number };
  onDelete: () => void;
  onChangeType: (type: BlockType) => void;
  onClose: () => void;
}

export default function BlockContextMenu({
  currentBlockType,
  position,
  onDelete,
  onChangeType,
  onClose,
}: BlockContextMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get all block types except the current one for "Turn into"
  const allTypes = getAllBlockTypes();
  const turnIntoOptions = allTypes.filter((opt) => opt.type !== currentBlockType);

  // Total items: Delete + divider (not selectable) + turn into options
  const selectableItems = 1 + turnIntoOptions.length; // Delete + turn into options

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < selectableItems - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : selectableItems - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex === 0) {
            onDelete();
          } else {
            const turnIntoIndex = selectedIndex - 1;
            if (turnIntoOptions[turnIntoIndex]) {
              onChangeType(turnIntoOptions[turnIntoIndex].type);
            }
          }
          onClose();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [selectableItems, selectedIndex, onDelete, onChangeType, onClose, turnIntoOptions]
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

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-notion-border py-1 min-w-[180px]"
      style={{ top: position.top, left: position.left }}
    >
      {/* Delete option */}
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
          selectedIndex === 0 ? 'bg-notion-hover' : 'hover:bg-notion-hover'
        }`}
      >
        <svg
          className="w-4 h-4 text-notion-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        <span className="text-sm text-notion-text">Delete</span>
      </button>

      {/* Divider */}
      <div className="border-t border-notion-border my-1" />

      {/* Turn into section header */}
      <div className="text-xs text-notion-text-secondary px-3 py-1">
        Turn into
      </div>

      {/* Turn into options */}
      {turnIntoOptions.map((option, index) => (
        <button
          key={option.type}
          onClick={() => {
            onChangeType(option.type);
            onClose();
          }}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
            selectedIndex === index + 1 ? 'bg-notion-hover' : 'hover:bg-notion-hover'
          }`}
        >
          <span className="w-5 h-5 flex items-center justify-center bg-notion-sidebar rounded text-xs">
            {option.icon}
          </span>
          <span className="text-sm text-notion-text">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
