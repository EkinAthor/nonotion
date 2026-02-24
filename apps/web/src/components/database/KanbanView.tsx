import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
} from '@dnd-kit/core';
import type { DatabaseRow, PropertyDefinition, SelectOption, PublicUser } from '@nonotion/shared';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import { usePageStore } from '@/stores/pageStore';
import { usersApi } from '@/api/client';
import { COLOR_CLASSES } from '@/lib/select-colors';

interface KanbanViewProps {
  canEdit: boolean;
}

const NO_VALUE_COLUMN_ID = '__no_value__';

// Minimum column width so 4 columns fit in the database content area.
// Database max-width is max-w-6xl (1152px) with px-8 (64px) → 1088px usable.
// Kanban has p-4 (32px) and 3 × gap-3 (36px) → (1088 - 32 - 36) / 4 ≈ 255px.
// Using 250px as minimum to leave a small margin.
const MIN_COLUMN_WIDTH = 250;

export default function KanbanView({ canEdit }: KanbanViewProps) {
  const {
    rows,
    viewConfig,
    activeDatabaseId,
    moveCardToColumn,
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

  // Fetch users once for person property display
  const hasPersonProperty = schema?.properties.some((p) => p.type === 'person') ?? false;
  useEffect(() => {
    if (hasPersonProperty && userMap.size === 0) {
      usersApi.getAll().then((users) => {
        setUserMap(new Map(users.map((u) => [u.id, u])));
      }).catch(() => {});
    }
  }, [hasPersonProperty, userMap.size]);

  // Group rows into columns
  const visibleOptions = options.filter((o) => !hiddenOptionIds.has(o.id));
  const showNoValue = !hiddenOptionIds.has(NO_VALUE_COLUMN_ID);
  const columnMap = new Map<string, DatabaseRow[]>();
  if (showNoValue) {
    columnMap.set(NO_VALUE_COLUMN_ID, []);
  }
  for (const opt of visibleOptions) {
    columnMap.set(opt.id, []);
  }
  for (const row of rows) {
    if (!groupByPropertyId) continue;
    const prop = row.properties[groupByPropertyId];
    const selectValue = prop?.type === 'select' ? prop.value : null;
    if (!selectValue) {
      if (showNoValue) {
        columnMap.get(NO_VALUE_COLUMN_ID)?.push(row);
      }
    } else if (columnMap.has(selectValue)) {
      columnMap.get(selectValue)!.push(row);
    }
  }

  // Visible properties excluding title and groupBy — called directly (not memoized)
  // so it reacts to hiddenPropertyIds changes immediately
  const allVisible = getVisibleProperties();
  const cardProperties = allVisible.filter(
    (p) => p.type !== 'title' && p.id !== groupByPropertyId
  );

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const row = rows.find((r) => r.id === event.active.id);
    setActiveRow(row ?? null);
  }, [rows]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveRow(null);
    if (!event.over || !canEdit) return;

    const rowId = event.active.id as string;
    const columnId = (event.over.id as string).replace('column:', '');
    const targetOptionId = columnId === NO_VALUE_COLUMN_ID ? null : columnId;

    moveCardToColumn(rowId, targetOptionId);
  }, [canEdit, moveCardToColumn]);

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

  const totalColumns = visibleOptions.length + (showNoValue ? 1 : 0);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-3 p-4 min-h-[200px] overflow-x-auto"
        style={{
          /* Each column gets equal share but never narrower than MIN_COLUMN_WIDTH */
        }}
      >
        {/* No Value column */}
        {showNoValue && (
          <KanbanColumn
            columnId={NO_VALUE_COLUMN_ID}
            label="No Value"
            rows={columnMap.get(NO_VALUE_COLUMN_ID) ?? []}
            cardProperties={cardProperties}
            canEdit={canEdit}
            onAddRow={() => handleAddRow(null)}
            onRowClick={(id) => navigate(`/page/${id}`)}
            userMap={userMap}
            totalColumns={totalColumns}
          />
        )}

        {/* Option columns */}
        {visibleOptions.map((option) => (
          <KanbanColumn
            key={option.id}
            columnId={option.id}
            label={option.name}
            option={option}
            rows={columnMap.get(option.id) ?? []}
            cardProperties={cardProperties}
            canEdit={canEdit}
            onAddRow={() => handleAddRow(option.id)}
            onRowClick={(id) => navigate(`/page/${id}`)}
            userMap={userMap}
            totalColumns={totalColumns}
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
  userMap: Map<string, PublicUser>;
  totalColumns: number;
}

function KanbanColumn({ columnId, label, option, rows, cardProperties, canEdit, onAddRow, onRowClick, userMap, totalColumns }: KanbanColumnProps) {
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

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg flex-shrink-0 ${
        isOver ? 'bg-blue-50' : 'bg-gray-50'
      }`}
      style={{
        /* flex-basis fills available space equally, min-width ensures 4 cols fit at 1080p */
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

      {/* Cards */}
      <div className="flex flex-col gap-2 px-2 pb-2 flex-1 min-h-[40px]">
        {rows.map((row) => (
          <KanbanCard
            key={row.id}
            row={row}
            cardProperties={cardProperties}
            canEdit={canEdit}
            onClick={() => onRowClick(row.id)}
            userMap={userMap}
          />
        ))}

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

interface KanbanCardProps {
  row: DatabaseRow;
  cardProperties: PropertyDefinition[];
  canEdit: boolean;
  onClick: () => void;
  userMap: Map<string, PublicUser>;
}

function KanbanCard({ row, cardProperties, canEdit, onClick, userMap }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.id,
    disabled: !canEdit,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

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
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {/* Title */}
      <div className="text-sm font-medium text-notion-text truncate">
        {row.icon && <span className="mr-1">{row.icon}</span>}
        {row.title || 'Untitled'}
      </div>

      {/* Property previews - vertical layout, all visible properties */}
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
  value: import('@nonotion/shared').PropertyValue | undefined;
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
            {value.value ? '☑' : '☐'}
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
