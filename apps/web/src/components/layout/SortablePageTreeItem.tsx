import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePageStore } from '@/stores/pageStore';
import type { FlattenedItem } from '@/lib/sidebar-dnd';

interface SortablePageTreeItemProps {
  item: FlattenedItem;
}

export default function SortablePageTreeItem({ item }: SortablePageTreeItemProps) {
  const navigate = useNavigate();
  const { currentPageId, toggleExpanded, expandedNodes, createPage, deletePage } =
    usePageStore();
  const [showActions, setShowActions] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const { node, depth } = item;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = currentPageId === node.id;
  const hasChildren = node.children.length > 0;

  const handleClick = () => {
    navigate(`/page/${node.id}`);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(node.id);
  };

  const handleAddChild = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCreating) return;
    setIsCreating(true);
    try {
      const page = await createPage({ title: 'Untitled', parentId: node.id });
      if (!isExpanded) {
        toggleExpanded(node.id);
      }
      navigate(`/page/${page.id}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${node.title}"?`)) {
      deletePage(node.id);
      if (isSelected) {
        navigate('/');
      }
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center px-1 py-0.5 rounded cursor-pointer group ${
          isSelected ? 'bg-notion-hover' : 'hover:bg-notion-hover'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Drag handle */}
        <button
          className="flex-shrink-0 w-4 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing text-notion-text-secondary"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
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

        {/* Toggle/Expand button */}
        <button
          onClick={handleToggle}
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 ${
            hasChildren ? 'visible' : 'invisible'
          }`}
        >
          <svg
            className={`w-3 h-3 text-notion-text-secondary transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>

        {/* Icon */}
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm">
          {node.icon || (node.type === 'database' ? '🗃️' : '📄')}
        </span>

        {/* Title */}
        <span className="flex-1 ml-1 text-sm text-notion-text truncate">
          {node.title || 'Untitled'}
        </span>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleAddChild}
              disabled={isCreating}
              className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-50"
              title="Add subpage"
            >
              <svg
                className="w-3.5 h-3.5 text-notion-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              className="p-0.5 rounded hover:bg-gray-200"
              title="Delete"
            >
              <svg
                className="w-3.5 h-3.5 text-notion-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
