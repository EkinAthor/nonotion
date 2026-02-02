import { useState, useRef, useEffect } from 'react';
import type { SelectOption, SelectColor } from '@nonotion/shared';

interface SelectCellProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  canEdit: boolean;
  rowId: string;
}

const COLOR_CLASSES: Record<SelectColor, { bg: string; text: string }> = {
  gray: { bg: 'bg-gray-200', text: 'text-gray-700' },
  brown: { bg: 'bg-amber-200', text: 'text-amber-800' },
  orange: { bg: 'bg-orange-200', text: 'text-orange-800' },
  yellow: { bg: 'bg-yellow-200', text: 'text-yellow-800' },
  green: { bg: 'bg-green-200', text: 'text-green-800' },
  blue: { bg: 'bg-blue-200', text: 'text-blue-800' },
  purple: { bg: 'bg-purple-200', text: 'text-purple-800' },
  pink: { bg: 'bg-pink-200', text: 'text-pink-800' },
  red: { bg: 'bg-red-200', text: 'text-red-800' },
};

export default function SelectCell({ value, onChange, options, canEdit }: SelectCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.id === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 200; // Approximate max height
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setDropdownPosition('top');
      } else {
        setDropdownPosition('bottom');
      }
    }
  }, [isOpen]);

  const handleSelect = (optionId: string | null) => {
    onChange(optionId);
    setIsOpen(false);
  };

  const renderBadge = (option: SelectOption) => {
    const colors = COLOR_CLASSES[option.color];
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
      >
        {option.name}
      </span>
    );
  };

  if (!canEdit) {
    return (
      <div className="py-0.5">
        {selectedOption ? renderBadge(selectedOption) : <span className="text-notion-text-secondary">-</span>}
      </div>
    );
  }

  const dropdownClasses = dropdownPosition === 'top'
    ? 'absolute left-0 bottom-full mb-1 bg-white border border-notion-border rounded-md shadow-lg z-20 min-w-[150px]'
    : 'absolute left-0 top-full mt-1 bg-white border border-notion-border rounded-md shadow-lg z-20 min-w-[150px]';

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="py-0.5 cursor-pointer hover:bg-gray-100 rounded px-1 min-h-[24px]"
      >
        {selectedOption ? (
          renderBadge(selectedOption)
        ) : (
          <span className="text-notion-text-secondary">Select...</span>
        )}
      </div>

      {isOpen && (
        <div ref={dropdownRef} className={dropdownClasses}>
          {value && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(null);
              }}
              className="w-full px-2 py-1 text-sm text-left text-notion-text-secondary hover:bg-notion-hover"
            >
              Clear
            </button>
          )}
          {options.map((option) => (
            <button
              key={option.id}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(option.id);
              }}
              className={`w-full px-2 py-1 text-left hover:bg-notion-hover ${
                option.id === value ? 'bg-blue-50' : ''
              }`}
            >
              {renderBadge(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
