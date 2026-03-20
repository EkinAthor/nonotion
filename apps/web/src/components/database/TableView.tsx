import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PropertyDefinition, PropertyValue, SortConfig, DatabaseRow } from '@nonotion/shared';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import CellRenderer from './cells/CellRenderer';

interface TableViewProps {
  canEdit: boolean;
}

export default function TableView({ canEdit }: TableViewProps) {
  const navigate = useNavigate();
  const { rows, total, isLoadingMore, loadMore, activeDatabaseId, updateRowProperties, addRow, viewConfig, setSort, getVisibleProperties, reorderRows } = useDatabaseInstance();
  const { createPage } = usePageStore();
  const { openPeekPanel } = useUiStore();
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const properties = getVisibleProperties();
  const hasSortActive = !!viewConfig.sort;
  const canDragRows = canEdit && !hasSortActive;

  const handleCellChange = (rowId: string, propertyId: string, value: PropertyValue) => {
    updateRowProperties(rowId, { [propertyId]: value });
  };

  const handleRowClick = (rowId: string) => {
    navigate(`/page/${rowId}`);
  };

  const handleAddRow = async () => {
    if (!activeDatabaseId || isAddingRow) return;
    setIsAddingRow(true);
    try {
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
        properties: {},
      });
    } finally {
      setIsAddingRow(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveRowId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveRowId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = rows.map((r) => r.id);
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, active.id as string);
    reorderRows(newOrder);
  };

  if (properties.length === 0) {
    return (
      <div className="p-4 text-notion-text-secondary">
        No properties defined. Add a property to get started.
      </div>
    );
  }

  const activeRow = activeRowId ? rows.find((r) => r.id === activeRowId) : null;

  const tableContent = (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-notion-border">
          {canDragRows && (
            <th className="w-6 px-0 py-1" />
          )}
          {properties.map((prop) => (
            <TableHeader
              key={prop.id}
              property={prop}
              sortConfig={viewConfig.sort}
              onSort={setSort}
            />
          ))}
          {/* No action column — peek button overlays first cell */}
        </tr>
      </thead>
      <tbody>
        {canDragRows ? (
          <SortableContext
            items={rows.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            {rows.map((row) => (
              <SortableRow
                key={row.id}
                row={row}
                properties={properties}
                canEdit={canEdit}
                onCellChange={handleCellChange}
                onRowClick={handleRowClick}
                onPeekOpen={openPeekPanel}
              />
            ))}
          </SortableContext>
        ) : (
          rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-notion-border hover:bg-notion-hover cursor-pointer group/row"
            >
              {properties.map((prop, index) => (
                <td
                  key={prop.id}
                  className={`px-2 py-1 text-sm ${index === 0 ? 'relative' : ''}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName === 'TD') {
                      handleRowClick(row.id);
                    }
                  }}
                >
                  {index === 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openPeekPanel(row.id); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 px-1.5 py-0.5 text-xs text-notion-text-secondary hover:bg-gray-200 rounded bg-white/90 z-10 flex items-center gap-1"
                      title="Open in side peek"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open
                    </button>
                  )}
                  <CellRenderer
                    property={prop}
                    value={prop.type === 'title'
                      ? { type: 'title', value: row.title }
                      : row.properties[prop.id]
                    }
                    onChange={(value) => handleCellChange(row.id, prop.id, value)}
                    canEdit={canEdit}
                    rowId={row.id}
                  />
                </td>
              ))}
            </tr>
          ))
        )}

        {/* New Row Button */}
        {canEdit && (
          <tr>
            <td colSpan={properties.length + (canDragRows ? 1 : 0)} className="px-2 py-1">
              <button
                onClick={handleAddRow}
                disabled={isAddingRow}
                className="flex items-center gap-1 w-full px-2 py-1 text-sm text-notion-text-secondary hover:bg-notion-hover rounded disabled:opacity-50"
              >
                {isAddingRow ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                {isAddingRow ? 'Adding...' : 'New'}
              </button>
            </td>
          </tr>
        )}

        {/* Load More */}
        {rows.length < total && (
          <tr>
            <td colSpan={properties.length + (canDragRows ? 1 : 0)} className="px-2 py-1">
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="flex items-center justify-center gap-2 w-full px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded disabled:opacity-50"
              >
                {isLoadingMore && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {isLoadingMore ? 'Loading...' : `Showing ${rows.length} of ${total} - Load more`}
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="overflow-x-auto">
      {canDragRows ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {tableContent}
          <DragOverlay>
            {activeRow && (
              <table className="w-full border-collapse bg-white shadow-lg rounded border border-notion-border opacity-90">
                <tbody>
                  <tr>
                    <td className="w-6 px-0 py-1" />
                    {properties.map((prop) => (
                      <td key={prop.id} className="px-2 py-1 text-sm">
                        <CellRenderer
                          property={prop}
                          value={prop.type === 'title'
                            ? { type: 'title', value: activeRow.title }
                            : activeRow.properties[prop.id]
                          }
                          onChange={() => {}}
                          canEdit={false}
                          rowId={activeRow.id}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        tableContent
      )}

      {rows.length === 0 && (
        <div className="p-8 text-center text-notion-text-secondary">
          No rows yet. Click "New" to add your first row.
        </div>
      )}
    </div>
  );
}

interface SortableRowProps {
  row: DatabaseRow;
  properties: PropertyDefinition[];
  canEdit: boolean;
  onCellChange: (rowId: string, propertyId: string, value: PropertyValue) => void;
  onRowClick: (rowId: string) => void;
  onPeekOpen: (rowId: string) => void;
}

function SortableRow({ row, properties, canEdit, onCellChange, onRowClick, onPeekOpen }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-notion-border hover:bg-notion-hover cursor-pointer group/row"
    >
      {/* Drag handle */}
      <td className="w-6 px-0 py-1">
        <button
          className="w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover/row:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing text-notion-text-secondary"
          {...attributes}
          {...listeners}
        >
          <svg className="w-3 h-3" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="2" r="1.2" />
            <circle cx="7" cy="2" r="1.2" />
            <circle cx="3" cy="6" r="1.2" />
            <circle cx="7" cy="6" r="1.2" />
            <circle cx="3" cy="10" r="1.2" />
            <circle cx="7" cy="10" r="1.2" />
            <circle cx="3" cy="14" r="1.2" />
            <circle cx="7" cy="14" r="1.2" />
          </svg>
        </button>
      </td>
      {properties.map((prop, index) => (
        <td
          key={prop.id}
          className={`px-2 py-1 text-sm ${index === 0 ? 'relative' : ''}`}
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName === 'TD') {
              onRowClick(row.id);
            }
          }}
        >
          {index === 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onPeekOpen(row.id); }}
              className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 px-1.5 py-0.5 text-xs text-notion-text-secondary hover:bg-gray-200 rounded bg-white/90 z-10 flex items-center gap-1"
              title="Open in side peek"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open
            </button>
          )}
          <CellRenderer
            property={prop}
            value={prop.type === 'title'
              ? { type: 'title', value: row.title }
              : row.properties[prop.id]
            }
            onChange={(value) => onCellChange(row.id, prop.id, value)}
            canEdit={canEdit}
            rowId={row.id}
          />
        </td>
      ))}
    </tr>
  );
}

interface TableHeaderProps {
  property: PropertyDefinition;
  sortConfig?: SortConfig;
  onSort: (sort: SortConfig | undefined) => void;
}

function TableHeader({ property, sortConfig, onSort }: TableHeaderProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'title': return 'T';
      case 'text': return 'T';
      case 'select': return '▼';
      case 'multi_select': return '◆';
      case 'date': return '📅';
      case 'checkbox': return '☐';
      case 'url': return '🔗';
      case 'person': return '👤';
      default: return '•';
    }
  };

  const isActive = sortConfig?.propertyId === property.id;
  const currentDirection = isActive ? sortConfig.direction : undefined;

  const handleClick = () => {
    // 3-state cycling: none → asc → desc → none
    if (!currentDirection) {
      onSort({ propertyId: property.id, direction: 'asc' });
    } else if (currentDirection === 'asc') {
      onSort({ propertyId: property.id, direction: 'desc' });
    } else {
      onSort(undefined);
    }
  };

  return (
    <th
      className={`px-2 py-1 text-left text-xs font-medium border-r border-notion-border last:border-r-0 cursor-pointer select-none hover:bg-notion-hover ${
        isActive ? 'text-blue-600' : 'text-notion-text-secondary'
      }`}
      style={{ minWidth: property.width || 150 }}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        <span className="opacity-60">{getTypeIcon(property.type)}</span>
        <span>{property.name}</span>
        {isActive && (
          <span className="ml-auto text-blue-600">
            {currentDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );
}
