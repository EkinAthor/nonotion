import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import { IS_DEMO_MODE } from '@/api/client';
import { COLOR_CLASSES } from '@/lib/select-colors';
import FilterPopover, { getFilterSummary } from './FilterPopover';
import PropertiesPanel from './PropertiesPanel';

interface DatabaseToolbarProps {
  canEdit: boolean;
}

export default function DatabaseToolbar({ canEdit }: DatabaseToolbarProps) {
  const {
    viewConfig,
    setFilters,
    getAllPropertiesOrdered,
    saveAsDefault,
    revertToDefault,
    hasDefaultConfig,
    setViewType,
    setKanbanGroupBy,
    toggleKanbanColumnVisibility,
    getSelectProperties,
    schema,
  } = useDatabaseInstance();
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);
  const [showColumnsPopover, setShowColumnsPopover] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const propertiesButtonRef = useRef<HTMLButtonElement>(null);
  const groupByButtonRef = useRef<HTMLButtonElement>(null);
  const columnsButtonRef = useRef<HTMLButtonElement>(null);

  const properties = getAllPropertiesOrdered();
  const activeFilterCount = viewConfig.filters.length;
  const selectProperties = getSelectProperties();
  const hasSelectProperty = selectProperties.length > 0;
  const isKanban = viewConfig.viewType === 'kanban';

  // Get current groupBy property for display
  const kanbanGroupByProperty = isKanban && viewConfig.kanban
    ? schema?.properties.find((p) => p.id === viewConfig.kanban!.groupByPropertyId)
    : null;

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
        {/* View type switcher */}
        <div className="flex items-center border border-notion-border rounded">
          {/* Table view button */}
          <button
            onClick={() => setViewType('table')}
            className={`flex items-center gap-1 px-2 py-1 text-sm rounded-l ${
              !isKanban ? 'bg-notion-hover text-notion-text' : 'text-notion-text-secondary hover:bg-notion-hover'
            }`}
            title="Table view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18" />
            </svg>
          </button>
          {/* Kanban view button */}
          <button
            onClick={() => {
              if (hasSelectProperty) setViewType('kanban');
            }}
            disabled={!hasSelectProperty}
            className={`flex items-center gap-1 px-2 py-1 text-sm rounded-r ${
              isKanban ? 'bg-notion-hover text-notion-text' : 'text-notion-text-secondary hover:bg-notion-hover'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={hasSelectProperty ? 'Kanban view' : 'Add a select property to use kanban view'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </button>
        </div>

        {/* Kanban-specific: Group by dropdown */}
        {isKanban && (
          <div>
            <button
              ref={groupByButtonRef}
              onClick={() => setShowGroupByDropdown(!showGroupByDropdown)}
              className="flex items-center gap-1 px-2 py-1 text-sm text-notion-text-secondary rounded hover:bg-notion-hover"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Group by: {kanbanGroupByProperty?.name ?? 'Select...'}
            </button>
            {showGroupByDropdown && (
              <GroupByDropdown
                selectProperties={selectProperties}
                currentPropertyId={viewConfig.kanban?.groupByPropertyId}
                onSelect={(id) => {
                  setKanbanGroupBy(id);
                  setShowGroupByDropdown(false);
                }}
                onClose={() => setShowGroupByDropdown(false)}
                anchorRef={groupByButtonRef}
              />
            )}
          </div>
        )}

        {/* Kanban-specific: Columns visibility */}
        {isKanban && kanbanGroupByProperty && (
          <div>
            <button
              ref={columnsButtonRef}
              onClick={() => setShowColumnsPopover(!showColumnsPopover)}
              className="flex items-center gap-1 px-2 py-1 text-sm text-notion-text-secondary rounded hover:bg-notion-hover"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Columns
            </button>
            {showColumnsPopover && (
              <ColumnsPopover
                property={kanbanGroupByProperty}
                hiddenOptionIds={viewConfig.kanban?.hiddenOptionIds ?? []}
                onToggle={toggleKanbanColumnVisibility}
                onClose={() => setShowColumnsPopover(false)}
                anchorRef={columnsButtonRef}
              />
            )}
          </div>
        )}

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

        {/* Revert to default */}
        {hasDefaultConfig() && (
          <button
            onClick={revertToDefault}
            className="flex items-center gap-1 px-2 py-1 text-sm text-notion-text-secondary rounded hover:bg-notion-hover"
            title="Revert view to saved default"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Revert to default
          </button>
        )}

        {/* Save as default */}
        {canEdit && !IS_DEMO_MODE && (
          <button
            onClick={async () => {
              setIsSaving(true);
              try {
                await saveAsDefault();
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1 text-sm text-notion-text-secondary rounded hover:bg-notion-hover disabled:opacity-50"
            title="Save current view as default for all users"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {isSaving ? 'Saving...' : 'Save as default'}
          </button>
        )}

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

/** Dropdown to pick which select property to group by */
function GroupByDropdown({
  selectProperties,
  currentPropertyId,
  onSelect,
  onClose,
  anchorRef,
}: {
  selectProperties: import('@nonotion/shared').PropertyDefinition[];
  currentPropertyId?: string;
  onSelect: (propertyId: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
  }, [anchorRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          !anchorRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  if (!position) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed bg-white border border-notion-border rounded-md shadow-lg z-[100] w-[200px] py-1"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-2 py-1 text-xs font-medium text-notion-text-secondary">
        Group by
      </div>
      {selectProperties.map((prop) => (
        <button
          key={prop.id}
          onClick={() => onSelect(prop.id)}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-notion-hover ${
            prop.id === currentPropertyId ? 'bg-blue-50 text-blue-600' : 'text-notion-text'
          }`}
        >
          {prop.name}
        </button>
      ))}
    </div>,
    document.body
  );
}

/** Popover to toggle kanban column visibility */
function ColumnsPopover({
  property,
  hiddenOptionIds,
  onToggle,
  onClose,
  anchorRef,
}: {
  property: import('@nonotion/shared').PropertyDefinition;
  hiddenOptionIds: string[];
  onToggle: (optionId: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const options = property.options ?? [];
  const hiddenSet = new Set(hiddenOptionIds);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
  }, [anchorRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          !anchorRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  if (!position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed bg-white border border-notion-border rounded-md shadow-lg z-[100] w-[220px] py-1"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-2 py-1 text-xs font-medium text-notion-text-secondary">
        Toggle columns
      </div>
      {options.map((option) => {
        const isHidden = hiddenSet.has(option.id);
        const colors = COLOR_CLASSES[option.color];
        return (
          <button
            key={option.id}
            onClick={() => onToggle(option.id)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-notion-hover"
          >
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
              {option.name}
            </span>
            {isHidden ? (
              <svg className="w-4 h-4 text-notion-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
