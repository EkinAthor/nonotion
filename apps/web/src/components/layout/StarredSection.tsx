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
import { usePageStore } from '@/stores/pageStore';
import type { Page, PageTreeNode } from '@nonotion/shared';
import PageTree from './PageTree';

export default function StarredSection() {
  const navigate = useNavigate();
  const { getStarredPages, getPageTree, currentPageId, starredExpandedNodes, toggleStarredExpanded, updatePageOrder } = usePageStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const starredPages = getStarredPages();

  if (starredPages.length === 0) {
    return null;
  }

  // Build a lookup of page tree nodes so we can find children for starred pages
  const allTree = getPageTree();
  const treeNodeMap = new Map<string, PageTreeNode>();
  const indexTree = (nodes: PageTreeNode[]) => {
    for (const node of nodes) {
      treeNodeMap.set(node.id, node);
      indexTree(node.children);
    }
  };
  indexTree(allTree);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = starredPages.findIndex((p) => p.id === active.id);
    const newIndex = starredPages.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = starredPages.map((p) => p.id);
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, active.id as string);
    updatePageOrder({ starredPageOrder: newOrder });
  };

  const activeItem = activeId ? starredPages.find((p) => p.id === activeId) : null;

  return (
    <div className="px-2 py-2 border-b border-notion-border">
      <div className="px-2 py-1 text-xs font-medium text-notion-text-secondary uppercase">
        Starred
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={starredPages.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {starredPages.map((page) => {
            const treeNode = treeNodeMap.get(page.id);
            const hasChildren = treeNode ? treeNode.children.length > 0 : false;
            const isExpanded = starredExpandedNodes.has(page.id);

            return (
              <SortableStarredItem
                key={page.id}
                page={page}
                treeNode={treeNode}
                hasChildren={hasChildren}
                isExpanded={isExpanded}
                isSelected={currentPageId === page.id}
                onNavigate={() => navigate(`/page/${page.id}`)}
                onToggle={() => toggleStarredExpanded(page.id)}
                starredExpandedNodes={starredExpandedNodes}
                toggleStarredExpanded={toggleStarredExpanded}
              />
            );
          })}
        </SortableContext>
        <DragOverlay>
          {activeItem && (
            <div className="flex items-center px-1 py-0.5 bg-white rounded shadow-lg border border-notion-border opacity-90">
              <span className="w-5 h-5 flex items-center justify-center text-sm">
                {activeItem.icon || '📄'}
              </span>
              <span className="ml-1 text-sm text-notion-text truncate">
                {activeItem.title || 'Untitled'}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface SortableStarredItemProps {
  page: Page;
  treeNode: PageTreeNode | undefined;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onNavigate: () => void;
  onToggle: () => void;
  starredExpandedNodes: Set<string>;
  toggleStarredExpanded: (id: string) => void;
}

function SortableStarredItem({ page, treeNode, hasChildren, isExpanded, isSelected, onNavigate, onToggle, starredExpandedNodes, toggleStarredExpanded }: SortableStarredItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center px-1 py-0.5 rounded cursor-pointer group ${
          isSelected ? 'bg-notion-hover' : 'hover:bg-notion-hover'
        }`}
        onClick={onNavigate}
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

        {/* Toggle button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
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

        <span className="w-5 h-5 flex items-center justify-center text-sm">
          {page.icon || '📄'}
        </span>
        <span className="ml-1 text-sm text-notion-text truncate">
          {page.title || 'Untitled'}
        </span>
      </div>

      {/* Children — uses starred-specific expanded state */}
      {isExpanded && hasChildren && treeNode && (
        <PageTree
          nodes={treeNode.children}
          depth={1}
          expandedNodesOverride={starredExpandedNodes}
          toggleExpandedOverride={toggleStarredExpanded}
        />
      )}
    </div>
  );
}
