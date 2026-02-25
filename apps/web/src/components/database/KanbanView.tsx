import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DatabaseRow, PropertyDefinition, PropertyValue, SelectOption, PublicUser } from '@nonotion/shared';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import { usePageStore } from '@/stores/pageStore';
import { usersApi } from '@/api/client';
import { COLOR_CLASSES } from '@/lib/select-colors';
import CellRenderer from './cells/CellRenderer';

/** Check if a property value is empty (no meaningful data to display) */
function isEmptyValue(value: PropertyValue | undefined): boolean {
  if (!value) return true;
  switch (value.type) {
    case 'text':
    case 'url':
      return !value.value;
    case 'select':
    case 'person':
    case 'date':
      return !value.value;
    case 'multi_select':
      return value.value.length === 0;
    case 'checkbox':
      return false; // checkbox always has a meaningful value
    default:
      return true;
  }
}

interface KanbanViewProps {
  canEdit: boolean;
}

const NO_VALUE_COLUMN_ID = '__no_value__';

// Minimum column width so 4 columns fit in the database content area.
const MIN_COLUMN_WIDTH = 250;

/** Build compound key for kanbanCardOrder */
function columnKey(propertyId: string, optionId: string | null): string {
  return `${propertyId}:${optionId ?? NO_VALUE_COLUMN_ID}`;
}

/** Find which column a row belongs to */
function findRowColumn(
  rowId: string,
  columnEntries: Array<{ columnId: string; rows: DatabaseRow[] }>
): string | null {
  for (const entry of columnEntries) {
    if (entry.rows.some((r) => r.id === rowId)) {
      return entry.columnId;
    }
  }
  return null;
}

export default function KanbanView({ canEdit }: KanbanViewProps) {
  const {
    rows,
    viewConfig,
    activeDatabaseId,
    moveCardToColumn,
    reorderCardInColumn,
    moveCardToColumnAtIndex,
    getOrderedColumnRows,
    addRow,
    getVisibleProperties,
    schema,
  } = useDatabaseInstance();
  const { createPage } = usePageStore();
  const navigate = useNavigate();
  const [activeRow, setActiveRow] = useState<DatabaseRow | null>(null);
  const [userMap, setUserMap] = useState<Map<string, PublicUser>>(new Map());

  const kanban = viewConfig.kanban;
  const groupByPropertyId = kanban?.groupByPropertyId;
  const hiddenOptionIds = new Set(kanban?.hiddenOptionIds ?? []);

  // Get the groupBy property definition
  const groupByProperty = (() => {
    if (!schema || !groupByPropertyId) return null;
    return schema.properties.find((p) => p.id === groupByPropertyId) ?? null;
  })();

  const options = groupByProperty?.options ?? [];

  // Fetch users once for person property display (used by DragOverlay only)
  const hasPersonProperty = schema?.properties.some((p) => p.type === 'person') ?? false;
  useEffect(() => {
    if (hasPersonProperty && userMap.size === 0) {
      usersApi.list().then((users) => {
        setUserMap(new Map(users.map((u) => [u.id, u])));
      }).catch(() => {});
    }
  }, [hasPersonProperty, userMap.size]);

  // Group rows into columns
  const visibleOptions = options.filter((o) => !hiddenOptionIds.has(o.id));
  const showNoValue = !hiddenOptionIds.has(NO_VALUE_COLUMN_ID);

  // Build ordered column entries
  const columnEntries: Array<{
    columnId: string;
    label: string;
    option?: SelectOption;
    rows: DatabaseRow[];
  }> = [];

  const rawColumnMap = new Map<string, DatabaseRow[]>();
  if (showNoValue) rawColumnMap.set(NO_VALUE_COLUMN_ID, []);
  for (const opt of visibleOptions) rawColumnMap.set(opt.id, []);

  for (const row of rows) {
    if (!groupByPropertyId) continue;
    const prop = row.properties[groupByPropertyId];
    const selectValue = prop?.type === 'select' ? prop.value : null;
    if (!selectValue) {
      if (showNoValue) rawColumnMap.get(NO_VALUE_COLUMN_ID)?.push(row);
    } else if (rawColumnMap.has(selectValue)) {
      rawColumnMap.get(selectValue)!.push(row);
    }
  }

  // Apply saved order to each column
  if (showNoValue && groupByPropertyId) {
    const key = columnKey(groupByPropertyId, null);
    const ordered = getOrderedColumnRows(key, rawColumnMap.get(NO_VALUE_COLUMN_ID) ?? []);
    columnEntries.push({ columnId: NO_VALUE_COLUMN_ID, label: 'No Value', rows: ordered });
  }
  for (const opt of visibleOptions) {
    if (!groupByPropertyId) continue;
    const key = columnKey(groupByPropertyId, opt.id);
    const ordered = getOrderedColumnRows(key, rawColumnMap.get(opt.id) ?? []);
    columnEntries.push({ columnId: opt.id, label: opt.name, option: opt, rows: ordered });
  }

  // Visible properties excluding title and groupBy
  const allVisible = getVisibleProperties();
  const cardProperties = allVisible.filter(
    (p) => p.type !== 'title' && p.id !== groupByPropertyId
  );

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Track source column on drag start
  const sourceColumnRef = useRef<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const row = rows.find((r) => r.id === event.active.id);
    setActiveRow(row ?? null);
    sourceColumnRef.current = findRowColumn(event.active.id as string, columnEntries);
  }, [rows, columnEntries]);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Visual feedback is handled by sortable — no local state mutation needed
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveRow(null);
    if (!event.over || !canEdit || !groupByPropertyId) return;

    const rowId = event.active.id as string;
    const overId = event.over.id as string;

    // Determine target column and index
    let targetColumnId: string;
    let targetIndex: number;

    if (overId.startsWith('column:')) {
      // Dropped on empty area of column — append to end
      targetColumnId = overId.replace('column:', '');
      const col = columnEntries.find((c) => c.columnId === targetColumnId);
      targetIndex = col ? col.rows.filter((r) => r.id !== rowId).length : 0;
    } else {
      // Dropped on another card — find its column and position
      const overColumn = findRowColumn(overId, columnEntries);
      if (!overColumn) return;
      targetColumnId = overColumn;
      const col = columnEntries.find((c) => c.columnId === targetColumnId);
      if (!col) return;
      targetIndex = col.rows.findIndex((r) => r.id === overId);
      if (targetIndex === -1) targetIndex = col.rows.length;
    }

    const sourceColumnId = sourceColumnRef.current;
    const targetOptionId = targetColumnId === NO_VALUE_COLUMN_ID ? null : targetColumnId;

    if (sourceColumnId === targetColumnId) {
      // Same column reorder
      const key = columnKey(groupByPropertyId, targetOptionId);
      reorderCardInColumn(key, rowId, targetIndex);
    } else {
      // Cross-column move
      moveCardToColumnAtIndex(rowId, targetOptionId, targetIndex);
    }

    sourceColumnRef.current = null;
  }, [canEdit, groupByPropertyId, columnEntries, reorderCardInColumn, moveCardToColumnAtIndex]);

  const handleAddRow = useCallback(async (optionId: string | null) => {
    if (!activeDatabaseId || !groupByPropertyId) return;

    const page = await createPage({
      title: 'Untitled',
      parentId: activeDatabaseId,
    });

    addRow({
      id: page.id,
      title: page.title,
      icon: page.icon,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      properties: optionId
        ? { [groupByPropertyId]: { type: 'select', value: optionId } }
        : {},
    });

    if (optionId) {
      moveCardToColumn(page.id, optionId);
    }
  }, [activeDatabaseId, groupByPropertyId, createPage, addRow, moveCardToColumn]);

  if (!groupByProperty) {
    return (
      <div className="p-8 text-center text-notion-text-secondary">
        No select property available for kanban grouping.
      </div>
    );
  }

  const totalColumns = columnEntries.length;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 p-4 min-h-[200px] overflow-x-auto">
        {columnEntries.map((entry) => (
          <KanbanColumn
            key={entry.columnId}
            columnId={entry.columnId}
            label={entry.label}
            option={entry.option}
            rows={entry.rows}
            cardProperties={cardProperties}
            canEdit={canEdit}
            onAddRow={() => handleAddRow(entry.columnId === NO_VALUE_COLUMN_ID ? null : entry.columnId)}
            onRowClick={(id) => navigate(`/page/${id}`)}
            totalColumns={totalColumns}
            activeRowId={activeRow?.id ?? null}
          />
        ))}
      </div>

      <DragOverlay>
        {activeRow && (
          <KanbanCardOverlay
            row={activeRow}
            cardProperties={cardProperties}
            userMap={userMap}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface KanbanColumnProps {
  columnId: string;
  label: string;
  option?: SelectOption;
  rows: DatabaseRow[];
  cardProperties: PropertyDefinition[];
  canEdit: boolean;
  onAddRow: () => void;
  onRowClick: (id: string) => void;
  totalColumns: number;
  activeRowId: string | null;
}

function KanbanColumn({ columnId, label, option, rows, cardProperties, canEdit, onAddRow, onRowClick, totalColumns, activeRowId }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${columnId}` });
  const [isAdding, setIsAdding] = useState(false);

  const colors = option ? COLOR_CLASSES[option.color] : null;

  const handleAdd = async () => {
    setIsAdding(true);
    try {
      await onAddRow();
    } finally {
      setIsAdding(false);
    }
  };

  const rowIds = rows.map((r) => r.id);

  return (
    <div
      className={`flex flex-col rounded-lg flex-shrink-0 ${
        isOver ? 'bg-blue-50' : 'bg-gray-50'
      }`}
      style={{
        flexBasis: `calc((100% - ${(totalColumns - 1) * 12}px) / ${totalColumns})`,
        minWidth: MIN_COLUMN_WIDTH,
      }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {colors ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium truncate ${colors.bg} ${colors.text}`}>
            {label}
          </span>
        ) : (
          <span className="text-xs font-medium text-notion-text-secondary truncate">{label}</span>
        )}
        <span className="text-xs text-notion-text-secondary flex-shrink-0">{rows.length}</span>
      </div>

      {/* Cards with sortable context */}
      <div ref={setNodeRef} className="flex flex-col gap-2 px-2 pb-2 flex-1 min-h-[40px]">
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {rows.map((row) => (
            <SortableKanbanCard
              key={row.id}
              row={row}
              cardProperties={cardProperties}
              canEdit={canEdit}
              onClick={() => onRowClick(row.id)}
              isOverlay={activeRowId === row.id}
            />
          ))}
        </SortableContext>

        {/* Add new row */}
        {canEdit && (
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-white rounded transition-colors disabled:opacity-50"
          >
            {isAdding ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            New
          </button>
        )}
      </div>
    </div>
  );
}

interface SortableKanbanCardProps {
  row: DatabaseRow;
  cardProperties: PropertyDefinition[];
  canEdit: boolean;
  onClick: () => void;
  isOverlay: boolean;
}

function SortableKanbanCard({ row, cardProperties, canEdit, onClick, isOverlay }: SortableKanbanCardProps) {
  const { updateRowProperties } = useDatabaseInstance();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.id,
    disabled: !canEdit,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleCellChange = useCallback((propertyId: string, value: PropertyValue) => {
    updateRowProperties(row.id, { [propertyId]: value });
  }, [updateRowProperties, row.id]);

  // Filter to only non-empty properties
  const visibleProps = cardProperties.filter((prop) => !isEmptyValue(row.properties[prop.id]));

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      className={`bg-white rounded-lg border border-notion-border shadow-sm p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
        isDragging || isOverlay ? 'opacity-50' : ''
      }`}
    >
      {/* Title — static, click navigates to page */}
      <div className="text-sm font-medium text-notion-text truncate">
        {row.icon && <span className="mr-1">{row.icon}</span>}
        {row.title || 'Untitled'}
      </div>

      {/* Properties — compact, no labels, editable cells */}
      {visibleProps.length > 0 && (
        <div className="flex flex-col gap-1 mt-2 text-xs">
          {visibleProps.map((prop) => (
            <CardEditableProperty
              key={prop.id}
              property={prop}
              value={row.properties[prop.id]}
              rowId={row.id}
              canEdit={canEdit}
              onChange={(value) => handleCellChange(prop.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Wrapper that renders CellRenderer for a card property (no label, tooltip on hover) */
function CardEditableProperty({
  property,
  value,
  rowId,
  canEdit,
  onChange,
}: {
  property: PropertyDefinition;
  value: PropertyValue | undefined;
  rowId: string;
  canEdit: boolean;
  onChange: (value: PropertyValue) => void;
}) {
  return (
    <div
      className="min-w-0"
      title={property.name}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <CellRenderer
        property={property}
        value={value}
        onChange={onChange}
        canEdit={canEdit}
        rowId={rowId}
      />
    </div>
  );
}

function KanbanCardOverlay({ row, cardProperties, userMap }: { row: DatabaseRow; cardProperties: PropertyDefinition[]; userMap: Map<string, PublicUser> }) {
  return (
    <div className="bg-white rounded-lg border border-blue-300 shadow-lg p-3 max-w-[300px] rotate-2">
      <div className="text-sm font-medium text-notion-text truncate">
        {row.icon && <span className="mr-1">{row.icon}</span>}
        {row.title || 'Untitled'}
      </div>
      {cardProperties.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2">
          {cardProperties.map((prop) => (
            <CardPropertyPreview
              key={prop.id}
              property={prop}
              value={row.properties[prop.id]}
              userMap={userMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardPropertyPreviewProps {
  property: PropertyDefinition;
  value: PropertyValue | undefined;
  userMap: Map<string, PublicUser>;
}

function CardPropertyPreview({ property, value, userMap }: CardPropertyPreviewProps) {
  if (!value) return null;

  const label = (
    <span className="text-xs text-notion-text-secondary flex-shrink-0">{property.name}</span>
  );

  switch (value.type) {
    case 'text':
    case 'url':
      if (!value.value) return null;
      return (
        <div className="flex items-baseline gap-2 min-w-0">
          {label}
          <span className="text-xs text-notion-text truncate">
            {value.value}
          </span>
        </div>
      );

    case 'select': {
      if (!value.value) return null;
      const option = property.options?.find((o) => o.id === value.value);
      if (!option) return null;
      const colors = COLOR_CLASSES[option.color];
      return (
        <div className="flex items-center gap-2 min-w-0">
          {label}
          <span className={`inline-flex items-center px-1.5 py-0 rounded text-xs font-medium truncate ${colors.bg} ${colors.text}`}>
            {option.name}
          </span>
        </div>
      );
    }

    case 'multi_select': {
      if (value.value.length === 0) return null;
      return (
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          {value.value.map((optId) => {
            const option = property.options?.find((o) => o.id === optId);
            if (!option) return null;
            const colors = COLOR_CLASSES[option.color];
            return (
              <span key={optId} className={`inline-flex items-center px-1.5 py-0 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                {option.name}
              </span>
            );
          })}
        </div>
      );
    }

    case 'date':
      if (!value.value) return null;
      return (
        <div className="flex items-baseline gap-2 min-w-0">
          {label}
          <span className="text-xs text-notion-text">
            {new Date(value.value).toLocaleDateString()}
          </span>
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2 min-w-0">
          {label}
          <span className="text-xs">
            {value.value ? '\u2611' : '\u2610'}
          </span>
        </div>
      );

    case 'person': {
      if (!value.value) return null;
      const user = userMap.get(value.value);
      const displayName = user ? (user.name || user.email) : value.value;
      const initial = user
        ? (user.name ? user.name.charAt(0) : user.email.charAt(0)).toUpperCase()
        : '?';
      return (
        <div className="flex items-center gap-2 min-w-0">
          {label}
          <div className="flex items-center gap-1 min-w-0">
            <div className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium flex-shrink-0">
              {initial}
            </div>
            <span className="text-xs text-notion-text truncate">{displayName}</span>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
