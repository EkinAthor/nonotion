import { useState, useRef } from 'react';
import type { AddPropertyInput, PropertyType } from '@nonotion/shared';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import FilterPopover, { getFilterSummary } from './FilterPopover';

interface DatabaseToolbarProps {
  canEdit: boolean;
}

const PROPERTY_TYPES: { type: PropertyType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'select', label: 'Select', icon: '▼' },
  { type: 'multi_select', label: 'Multi-select', icon: '◆' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'checkbox', label: 'Checkbox', icon: '☐' },
  { type: 'url', label: 'URL', icon: '🔗' },
  { type: 'person', label: 'Person', icon: '👤' },
];

export default function DatabaseToolbar({ canEdit }: DatabaseToolbarProps) {
  const { updateSchema, viewConfig, setFilters, getVisibleProperties } = useDatabaseInstance();
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [isAddingProperty, setIsAddingProperty] = useState(false);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  const properties = getVisibleProperties();
  const activeFilterCount = viewConfig.filters.length;

  const handleAddProperty = async (type: PropertyType) => {
    const name = type === 'text' ? 'Text' :
                 type === 'select' ? 'Status' :
                 type === 'multi_select' ? 'Tags' :
                 type === 'date' ? 'Date' :
                 type === 'checkbox' ? 'Done' :
                 type === 'url' ? 'URL' :
                 type === 'person' ? 'Assignee' : 'Property';

    const input: AddPropertyInput = { name, type };

    // Add default options for select types
    if (type === 'select') {
      input.options = [
        { name: 'To Do', color: 'gray' },
        { name: 'In Progress', color: 'blue' },
        { name: 'Done', color: 'green' },
      ];
    }

    setIsAddingProperty(true);
    try {
      await updateSchema({ addProperties: [input] });
    } finally {
      setIsAddingProperty(false);
    }
    setShowAddProperty(false);
  };

  const removeFilter = (propertyId: string, operator: string) => {
    const newFilters = viewConfig.filters.filter(
      (f) => !(f.propertyId === propertyId && f.operator === operator)
    );
    setFilters(newFilters);
  };

  const clearAllFilters = () => {
    setFilters([]);
  };

  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-2 border-b border-notion-border">
        {/* Filter Button */}
        <div>
          <button
            ref={filterButtonRef}
            onClick={() => setShowFilterPopover(!showFilterPopover)}
            className={`flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-notion-hover ${
              activeFilterCount > 0 ? 'text-blue-600' : 'text-notion-text-secondary'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter
            {activeFilterCount > 0 && <span className="text-xs">({activeFilterCount})</span>}
          </button>

          {showFilterPopover && (
            <FilterPopover onClose={() => setShowFilterPopover(false)} anchorRef={filterButtonRef} />
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add Property Button */}
        {canEdit && (
          <div className="relative">
            <button
              onClick={() => setShowAddProperty(!showAddProperty)}
              className="flex items-center gap-1 px-2 py-1 text-sm text-notion-text-secondary rounded hover:bg-notion-hover"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add property
            </button>

            {showAddProperty && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-notion-border rounded-md shadow-lg z-10 min-w-[160px]">
                <div className="p-2 text-xs font-medium text-notion-text-secondary uppercase">Property type</div>
                {isAddingProperty ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-notion-text-secondary">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Adding...
                  </div>
                ) : (
                  PROPERTY_TYPES.map((pt) => (
                    <button
                      key={pt.type}
                      onClick={() => handleAddProperty(pt.type)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-notion-hover"
                    >
                      <span className="w-5 text-center">{pt.icon}</span>
                      {pt.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-notion-border flex-wrap">
          {viewConfig.filters.map((rule, idx) => {
            const summary = getFilterSummary(rule, properties);
            return (
              <span
                key={`${rule.propertyId}-${rule.operator}-${idx}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full"
              >
                {summary}
                <button
                  onClick={() => removeFilter(rule.propertyId, rule.operator)}
                  className="hover:bg-blue-100 rounded-full p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            );
          })}
          <button
            onClick={clearAllFilters}
            className="text-xs text-red-500 hover:text-red-700 px-1"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
