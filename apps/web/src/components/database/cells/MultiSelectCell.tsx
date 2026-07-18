import { useState, useRef, useEffect } from 'react';
import type { SelectOption, SelectColor } from '@nonotion/shared';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import { COLOR_CLASSES } from '@/lib/select-colors';
import OptionPickerMenu, { type OptionPickerItem } from './OptionPickerMenu';

interface MultiSelectCellProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  canEdit: boolean;
  rowId: string;
  propertyId: string;
}

const COLORS: SelectColor[] = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown', 'gray'];

function getNextColor(existingOptions: SelectOption[]): SelectColor {
  const usedColors = new Set(existingOptions.map(o => o.color));
  return COLORS.find(c => !usedColors.has(c)) || COLORS[existingOptions.length % COLORS.length];
}

function generateOptionId(): string {
  return `opt_${Math.random().toString(36).substring(2, 14)}`;
}

export default function MultiSelectCell({ value, onChange, options, canEdit, propertyId }: MultiSelectCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const updatePropertyOptions = useDatabaseInstance((state) => state.updatePropertyOptions);

  const selectedOptions = options.filter((o) => value.includes(o.id));

  // Focus edit input when inline rename starts.
  useEffect(() => {
    if (editingTagId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId]);

  const handleToggle = (optionId: string) => {
    if (value.includes(optionId)) {
      onChange(value.filter((id) => id !== optionId));
    } else {
      onChange([...value, optionId]);
    }
  };

  const handleCreateTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const newOption: SelectOption = {
      id: generateOptionId(),
      name: trimmed,
      color: getNextColor(options),
    };

    updatePropertyOptions(propertyId, [...options, newOption]);
    onChange([...value, newOption.id]); // create + select
  };

  const handleRenameTag = (optionId: string) => {
    const name = editingTagName.trim();
    if (!name) {
      setEditingTagId(null);
      return;
    }

    const updatedOptions = options.map((opt) =>
      opt.id === optionId ? { ...opt, name } : opt
    );

    updatePropertyOptions(propertyId, updatedOptions);
    setEditingTagId(null);
  };

  const handleDeleteTag = (optionId: string) => {
    const option = options.find((o) => o.id === optionId);
    if (option?.isDefault) return;

    const updatedOptions = options.filter((opt) => opt.id !== optionId);
    updatePropertyOptions(propertyId, updatedOptions);

    if (value.includes(optionId)) {
      onChange(value.filter((id) => id !== optionId));
    }
  };

  const startEditing = (option: SelectOption) => {
    setEditingTagId(option.id);
    setEditingTagName(option.name);
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

  // Filter options by the live search query.
  const query = search.trim().toLowerCase();
  const filtered = query
    ? options.filter((o) => o.name.toLowerCase().includes(query))
    : options;

  // Hide the create row on an exact (case-insensitive) name match.
  const exactMatch = options.some((o) => o.name.toLowerCase() === query);
  const createText = query && !exactMatch ? search.trim() : null;

  const renderOptionRow = (option: SelectOption) => {
    const isSelected = value.includes(option.id);
    if (editingTagId === option.id) {
      return (
        <div className="flex items-center px-2 py-1">
          <input
            ref={editInputRef}
            type="text"
            value={editingTagName}
            onChange={(e) => setEditingTagName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                handleRenameTag(option.id);
              } else if (e.key === 'Escape') {
                setEditingTagId(null);
              }
            }}
            onBlur={() => handleRenameTag(option.id)}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 px-1 py-0.5 text-sm border border-blue-400 rounded outline-none"
          />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between px-2 py-1 group">
        <div className="flex items-center gap-2 flex-1 text-left">
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
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              startEditing(option);
            }}
            className="p-0.5 hover:bg-gray-200 rounded"
            title="Rename"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          {option.isDefault ? (
            <span className="p-0.5" title="Default tag (cannot delete)">
              <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTag(option.id);
              }}
              className="p-0.5 hover:bg-red-100 rounded"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5 text-gray-500 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  };

  const items: OptionPickerItem[] = filtered.map((option) => ({
    id: option.id,
    isSelected: value.includes(option.id),
    disabledNav: editingTagId === option.id,
    render: () => renderOptionRow(option),
  }));

  const createColor = getNextColor(options);

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

      <OptionPickerMenu
        open={isOpen}
        anchorRef={containerRef}
        onClose={() => {
          setIsOpen(false);
          setEditingTagId(null);
          setSearch('');
        }}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search or create a tag..."
        items={items}
        onSelect={handleToggle}
        createText={createText}
        onCreate={handleCreateTag}
        createLabel={(text) => (
          <>
            <span className="text-notion-text-secondary">Create</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${COLOR_CLASSES[createColor].bg} ${COLOR_CLASSES[createColor].text}`}
            >
              {text}
            </span>
          </>
        )}
        emptyLabel="No tags yet. Create one below."
      />
    </div>
  );
}
