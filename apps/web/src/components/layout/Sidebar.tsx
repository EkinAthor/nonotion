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
  type DragMoveEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import { IS_DEMO_MODE } from '@/api/client';
import { flattenTree, getProjection, isValidProjection, type Projection } from '@/lib/sidebar-dnd';
import SortablePageTreeItem from './SortablePageTreeItem';
import StarredSection from './StarredSection';
import UserMenu from './UserMenu';
import ImportDialog from './ImportDialog';

export default function Sidebar() {
  const navigate = useNavigate();
  const { createPage, getPageTree, expandedNodes, isLoading, movePage, pages } = usePageStore();
  const { toggleSidebar, toggleSearch } = useUiStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [projected, setProjected] = useState<Projection | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const pageTree = getPageTree();
  const flatItems = flattenTree(pageTree, expandedNodes);

  const handleNewPage = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const page = await createPage({ title: 'Untitled' });
      navigate(`/page/${page.id}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleNewDatabase = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const page = await createPage({ title: 'Untitled Database', type: 'database' });
      navigate(`/page/${page.id}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setProjected(null);
    setOverId(null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const { active, over, delta } = event;
    if (!over || active.id === over.id) {
      setProjected(null);
      setOverId(null);
      return;
    }

    const activeItem = flatItems.find((item) => item.id === active.id);
    if (!activeItem || activeItem.isDatabaseRow) {
      setProjected(null);
      setOverId(null);
      return;
    }

    const proj = getProjection(flatItems, active.id as string, over.id as string, delta.x);
    if (proj && isValidProjection(activeItem, proj, pages)) {
      setProjected(proj);
      setOverId(over.id as string);
    } else {
      setProjected(null);
      setOverId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    const currentProjected = projected;
    const activeItem = flatItems.find((item) => item.id === active.id);

    setActiveId(null);
    setProjected(null);
    setOverId(null);

    if (!activeItem || !currentProjected) return;
    if (activeItem.isDatabaseRow) return;

    const pageId = active.id as string;
    const { parentId: newParentId, insertIndex } = currentProjected;

    // Auto-expand the new parent so the moved page is visible
    if (newParentId && !expandedNodes.has(newParentId)) {
      usePageStore.getState().toggleExpanded(newParentId);
    }

    movePage(pageId, newParentId, insertIndex);
  };

  const activeItem = activeId ? flatItems.find((item) => item.id === activeId) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-notion-border">
        <span className="font-semibold text-notion-text">Nonotion</span>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-notion-hover text-notion-text-secondary"
          title="Toggle sidebar"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pt-2">
        <button
          onClick={toggleSearch}
          className="flex items-center w-full px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <span className="flex-1 text-left">Search</span>
          <kbd className="px-1.5 py-0.5 text-[10px] text-notion-text-secondary bg-gray-100 rounded border border-gray-200">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Starred Section */}
      <StarredSection />

      {/* Pages Section */}
      <div className="flex-1 overflow-auto">
        <div className="px-2 py-2">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-notion-text-secondary uppercase">
            <span>Pages</span>
            <button
              onClick={handleNewPage}
              disabled={isCreating}
              className="p-0.5 rounded hover:bg-notion-hover disabled:opacity-50"
              title="New page"
            >
              <svg
                className="w-4 h-4"
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
          </div>

          {isLoading ? (
            <div className="px-2 py-4 text-sm text-notion-text-secondary">
              Loading...
            </div>
          ) : pageTree.length === 0 ? (
            <div className="px-2 py-4 text-sm text-notion-text-secondary">
              No pages yet
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={flatItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {flatItems.map((item) => (
                  <SortablePageTreeItem
                    key={item.id}
                    item={item}
                    showIndicator={
                      overId === item.id && projected
                        ? { depth: projected.depth }
                        : null
                    }
                  />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeItem && (
                  <div className="flex items-center px-1 py-0.5 bg-white rounded shadow-lg border border-notion-border opacity-90">
                    <span className="w-5 h-5 flex items-center justify-center text-sm">
                      {activeItem.node.icon || (activeItem.node.type === 'database' ? '🗃️' : '📄')}
                    </span>
                    <span className="ml-1 text-sm text-notion-text truncate">
                      {activeItem.node.title || 'Untitled'}
                    </span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* New Page/Database Buttons */}
      <div className="border-t border-notion-border px-2 py-2 space-y-1">
        <button
          onClick={handleNewPage}
          disabled={isCreating}
          className="flex items-center w-full px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded disabled:opacity-50"
        >
          {isCreating ? (
            <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          )}
          {isCreating ? 'Creating...' : 'New page'}
        </button>
        <button
          onClick={handleNewDatabase}
          disabled={isCreating}
          className="flex items-center w-full px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded disabled:opacity-50"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            />
          </svg>
          New database
        </button>
        <button
          onClick={() => !IS_DEMO_MODE && setIsImportOpen(true)}
          disabled={IS_DEMO_MODE}
          className={`flex items-center w-full px-2 py-1.5 text-sm text-notion-text-secondary rounded ${IS_DEMO_MODE ? 'opacity-50 cursor-not-allowed' : 'hover:bg-notion-hover'}`}
          title={IS_DEMO_MODE ? 'Import is not available in demo mode' : 'Import from Notion'}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Import from Notion
        </button>
      </div>

      {/* User Menu (bottom) */}
      <div className="border-t border-notion-border px-2 py-2">
        <UserMenu />
      </div>

      {/* Import Dialog */}
      <ImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </div>
  );
}
