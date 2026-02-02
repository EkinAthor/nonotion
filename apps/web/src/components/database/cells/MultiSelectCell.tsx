import { useState, useRef, useEffect } from 'react';
import type { SelectOption, SelectColor } from '@nonotion/shared';

interface MultiSelectCellProps {
  value: string[];
  onChange: (value: string[]) => void;
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

export default function MultiSelectCell({ value, onChange, options, canEdit }: MultiSelectCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOptions = options.filter((o) => value.includes(o.id));

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

  const handleToggle = (optionId: string) => {
    if (value.includes(optionId)) {
      onChange(value.filter((id) => id !== optionId));
    } else {
      onChange([...value, optionId]);
    }
  };

  const renderBadge = (option: SelectOption, showRemove = false) => {
    const colors = COLOR_CLASSES[option.color];
    return (
      <span
        key={option.id}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
      >
        {option.name}
        {showRemove && canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((id) => id !== option.id));
            }}
            className="hover:bg-black/10 rounded-full"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </span>
    );
  };

  if (!canEdit) {
    return (
      <div className="py-0.5 flex flex-wrap gap-1">
        {selectedOptions.length > 0 ? (
          selectedOptions.map((opt) => renderBadge(opt))
        ) : (
          <span className="text-notion-text-secondary">-</span>
        )}
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
        className="py-0.5 cursor-pointer hover:bg-gray-100 rounded px-1 min-h-[24px] flex flex-wrap gap-1"
      >
        {selectedOptions.length > 0 ? (
          selectedOptions.map((opt) => renderBadge(opt, true))
        ) : (
          <span className="text-notion-text-secondary">Select...</span>
        )}
      </div>

      {isOpen && (
        <div className={dropdownClasses}>
          {options.map((option) => {
            const isSelected = value.includes(option.id);
            return (
              <button
                key={option.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(option.id);
                }}
                className={`w-full px-2 py-1 flex items-center gap-2 text-left hover:bg-notion-hover ${
                  isSelected ? 'bg-blue-50' : ''
                }`}
              >
                <div
                  className={`w-4 h-4 border rounded flex items-center justify-center ${
                    isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {renderBadge(option)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
