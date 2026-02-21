import { useState, useRef } from 'react';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import FilterPopover, { getFilterSummary } from './FilterPopover';
import PropertiesPanel from './PropertiesPanel';

interface DatabaseToolbarProps {
  canEdit: boolean;
}

export default function DatabaseToolbar({ canEdit }: DatabaseToolbarProps) {
  const { viewConfig, setFilters, getAllPropertiesOrdered } = useDatabaseInstance();
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const propertiesButtonRef = useRef<HTMLButtonElement>(null);

  const properties = getAllPropertiesOrdered();
  const activeFilterCount = viewConfig.filters.length;

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

        {/* Properties Button */}
        <div>
          <button
            ref={propertiesButtonRef}
            onClick={() => setShowPropertiesPanel(!showPropertiesPanel)}
            className="flex items-center gap-1 px-2 py-1 text-sm text-notion-text-secondary rounded hover:bg-notion-hover"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Properties
          </button>

          {showPropertiesPanel && (
            <PropertiesPanel
              onClose={() => setShowPropertiesPanel(false)}
              anchorRef={propertiesButtonRef}
              canEdit={canEdit}
            />
          )}
        </div>
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
