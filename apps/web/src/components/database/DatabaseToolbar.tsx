import { useState } from 'react';
import type { AddPropertyInput, PropertyType } from '@nonotion/shared';
import { useDatabaseStore } from '@/stores/databaseStore';

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
  const { updateSchema, viewConfig, setSort, setFilter, getVisibleProperties } = useDatabaseStore();
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [isAddingProperty, setIsAddingProperty] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const properties = getVisibleProperties();

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
    // Note: Backend handles default options - select gets default status options,
    // multi-select starts empty so users create their own tags
    if (type === 'select') {
      input.options = [
        { name: 'To Do', color: 'gray' },
        { name: 'In Progress', color: 'blue' },
        { name: 'Done', color: 'green' },
      ];
    }
    // multi-select intentionally has no default options

    setIsAddingProperty(true);
    try {
      await updateSchema({ addProperties: [input] });
    } finally {
      setIsAddingProperty(false);
    }
    setShowAddProperty(false);
  };

  const handleSort = (propertyId: string, direction: 'asc' | 'desc') => {
    setSort({ propertyId, direction });
    setShowSortMenu(false);
  };

  const handleClearSort = () => {
    setSort(undefined);
    setShowSortMenu(false);
  };

  const handleFilter = (propertyId: string, operator: 'eq' | 'neq' | 'empty' | 'not_empty') => {
    setFilter({ propertyId, operator });
    setShowFilterMenu(false);
  };

  const handleClearFilter = () => {
    setFilter(undefined);
    setShowFilterMenu(false);
  };

  return (
    <div className="flex items-center gap-2 px-2 py-2 border-b border-notion-border">
      {/* Sort Button */}
      <div className="relative">
        <button
          onClick={() => setShowSortMenu(!showSortMenu)}
          className={`flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-notion-hover ${
            viewConfig.sort ? 'text-blue-600' : 'text-notion-text-secondary'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          Sort
          {viewConfig.sort && <span className="text-xs">(1)</span>}
        </button>

        {showSortMenu && (
          <div className="absolute left-0 top-full mt-1 bg-white border border-notion-border rounded-md shadow-lg z-10 min-w-[200px]">
            <div className="p-2 text-xs font-medium text-notion-text-secondary uppercase">Sort by</div>
            {properties.map((prop) => (
              <div key={prop.id} className="flex items-center justify-between px-2 py-1 hover:bg-notion-hover">
                <span className="text-sm">{prop.name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleSort(prop.id, 'asc')}
                    className="px-2 py-0.5 text-xs rounded hover:bg-gray-200"
                  >
                    A→Z
                  </button>
                  <button
                    onClick={() => handleSort(prop.id, 'desc')}
                    className="px-2 py-0.5 text-xs rounded hover:bg-gray-200"
                  >
                    Z→A
                  </button>
                </div>
              </div>
            ))}
            {viewConfig.sort && (
              <button
                onClick={handleClearSort}
                className="w-full px-2 py-1 text-sm text-left text-red-600 hover:bg-red-50 border-t border-notion-border"
              >
                Clear sort
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter Button */}
      <div className="relative">
        <button
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className={`flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-notion-hover ${
            viewConfig.filter ? 'text-blue-600' : 'text-notion-text-secondary'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter
          {viewConfig.filter && <span className="text-xs">(1)</span>}
        </button>

        {showFilterMenu && (
          <div className="absolute left-0 top-full mt-1 bg-white border border-notion-border rounded-md shadow-lg z-10 min-w-[200px]">
            <div className="p-2 text-xs font-medium text-notion-text-secondary uppercase">Filter by</div>
            {properties
              .filter((p) => p.type === 'checkbox' || p.type === 'select')
              .map((prop) => (
                <div key={prop.id} className="px-2 py-1">
                  <div className="text-sm font-medium mb-1">{prop.name}</div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleFilter(prop.id, 'not_empty')}
                      className="px-2 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                    >
                      Has value
                    </button>
                    <button
                      onClick={() => handleFilter(prop.id, 'empty')}
                      className="px-2 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                    >
                      Is empty
                    </button>
                  </div>
                </div>
              ))}
            {viewConfig.filter && (
              <button
                onClick={handleClearFilter}
                className="w-full px-2 py-1 text-sm text-left text-red-600 hover:bg-red-50 border-t border-notion-border"
              >
                Clear filter
              </button>
            )}
          </div>
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
  );
}
