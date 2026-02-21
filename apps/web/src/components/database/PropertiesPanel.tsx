import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PropertyDefinition, PropertyType, AddPropertyInput } from '@nonotion/shared';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';

const PROPERTY_TYPES: { type: PropertyType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'select', label: 'Select', icon: '▼' },
  { type: 'multi_select', label: 'Multi-select', icon: '◆' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'checkbox', label: 'Checkbox', icon: '☐' },
  { type: 'url', label: 'URL', icon: '🔗' },
  { type: 'person', label: 'Person', icon: '👤' },
];

function getTypeIcon(type: string): string {
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
}

interface PropertiesPanelProps {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  canEdit: boolean;
}

export default function PropertiesPanel({ onClose, anchorRef, canEdit }: PropertiesPanelProps) {
  const {
    updateSchema,
    getAllPropertiesOrdered,
    viewConfig,
    togglePropertyVisibility,
    setPropertyOrder,
  } = useDatabaseInstance();

  const properties = getAllPropertiesOrdered();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Position the popover relative to the anchor
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popoverHeight = 400;
    const popoverWidth = 320;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= popoverHeight
      ? rect.bottom + 4
      : Math.max(8, rect.top - popoverHeight - 4);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8));
    setPosition({ top, left });
  }, [anchorRef]);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, anchorRef]);

  // Sortable items: all non-title properties
  const titleProp = properties.find((p) => p.type === 'title');
  const sortableProps = properties.filter((p) => p.type !== 'title');
  const sortableIds = sortableProps.map((p) => p.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(active.id as string);
    const newIndex = sortableIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...sortableIds];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, active.id as string);

    // Include title at position 0 in the full order
    setPropertyOrder(titleProp ? [titleProp.id, ...newOrder] : newOrder);
  }, [sortableIds, setPropertyOrder, titleProp]);

  const handleRename = useCallback((id: string, name: string) => {
    updateSchema({ updateProperties: [{ id, name }] });
  }, [updateSchema]);

  const handleDelete = useCallback((id: string) => {
    updateSchema({ removePropertyIds: [id] });
  }, [updateSchema]);

  const handleAddProperty = async (type: PropertyType) => {
    const name = type === 'text' ? 'Text' :
                 type === 'select' ? 'Status' :
                 type === 'multi_select' ? 'Tags' :
                 type === 'date' ? 'Date' :
                 type === 'checkbox' ? 'Done' :
                 type === 'url' ? 'URL' :
                 type === 'person' ? 'Assignee' : 'Property';

    const input: AddPropertyInput = { name, type };

    if (type === 'select') {
      input.options = [
        { name: 'To Do', color: 'gray' },
        { name: 'In Progress', color: 'blue' },
        { name: 'Done', color: 'green' },
      ];
    }

    setIsAdding(true);
    try {
      await updateSchema({ addProperties: [input] });
    } finally {
      setIsAdding(false);
      setShowTypePicker(false);
    }
  };

  if (!position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed bg-white border border-notion-border rounded-md shadow-lg z-[100] w-[320px] max-h-[420px] overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-2 text-xs font-medium text-notion-text-secondary uppercase border-b border-notion-border">
        Properties
      </div>

      <div className="p-1">
        {/* Title property — not sortable, not deletable, not hideable */}
        {titleProp && (
          <div className="flex items-center gap-1 px-2 py-1.5 rounded">
            <span className="w-5 text-center text-notion-text-secondary cursor-default" title="Title cannot be reordered">
              ⋮⋮
            </span>
            <span className="w-5 text-center text-xs opacity-60">{getTypeIcon('title')}</span>
            <span className="flex-1 text-sm text-notion-text truncate">{titleProp.name}</span>
          </div>
        )}

        {/* Sortable properties */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {sortableProps.map((prop) => (
              <SortablePropertyRow
                key={prop.id}
                property={prop}
                isHidden={viewConfig.hiddenPropertyIds.includes(prop.id)}
                canEdit={canEdit}
                onRename={handleRename}
                onDelete={handleDelete}
                onToggleVisibility={togglePropertyVisibility}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Add property */}
      {canEdit && (
        <div className="border-t border-notion-border p-1">
          {showTypePicker ? (
            <div>
              <div className="px-2 py-1 text-xs font-medium text-notion-text-secondary uppercase">
                Property type
              </div>
              {isAdding ? (
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
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-notion-hover rounded"
                  >
                    <span className="w-5 text-center">{pt.icon}</span>
                    {pt.label}
                  </button>
                ))
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowTypePicker(true)}
              className="flex items-center gap-1 w-full px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add a property
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

interface SortablePropertyRowProps {
  property: PropertyDefinition;
  isHidden: boolean;
  canEdit: boolean;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

function SortablePropertyRow({
  property,
  isHidden,
  canEdit,
  onRename,
  onDelete,
  onToggleVisibility,
}: SortablePropertyRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: property.id });

  const [editName, setEditName] = useState(property.name);
  const [isEditing, setIsEditing] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== property.name) {
      onRename(property.id, trimmed);
    } else {
      setEditName(property.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setEditName(property.name);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 px-2 py-1 rounded hover:bg-notion-hover group"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="w-5 text-center text-notion-text-secondary cursor-grab active:cursor-grabbing touch-none"
        tabIndex={-1}
      >
        ⋮⋮
      </button>

      {/* Type icon */}
      <span className="w-5 text-center text-xs opacity-60">{getTypeIcon(property.type)}</span>

      {/* Property name — inline editable */}
      {canEdit && isEditing ? (
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1 text-sm px-1 py-0 border border-blue-400 rounded outline-none bg-white min-w-0"
        />
      ) : (
        <button
          onClick={() => { if (canEdit) { setIsEditing(true); setEditName(property.name); } }}
          className={`flex-1 text-sm text-left truncate min-w-0 ${canEdit ? 'cursor-text' : 'cursor-default'} ${isHidden ? 'text-notion-text-secondary line-through' : 'text-notion-text'}`}
        >
          {property.name}
        </button>
      )}

      {/* Visibility toggle */}
      <button
        onClick={() => onToggleVisibility(property.id)}
        className={`p-0.5 rounded opacity-0 group-hover:opacity-100 ${isHidden ? '!opacity-100 text-notion-text-secondary' : 'text-notion-text-secondary hover:text-notion-text'}`}
        title={isHidden ? 'Show in table' : 'Hide from table'}
      >
        {isHidden ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>

      {/* Delete button */}
      {canEdit && (
        <button
          onClick={() => onDelete(property.id)}
          className="p-0.5 rounded text-notion-text-secondary hover:text-red-600 opacity-0 group-hover:opacity-100"
          title="Delete property"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
