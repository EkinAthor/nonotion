import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Block, DatabaseViewContent } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { usePageStore } from '@/stores/pageStore';
import { useBlockContext } from '@/contexts/BlockContext';
import { createDatabaseInstanceStore, DatabaseInstanceProvider, useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import TableView from '@/components/database/TableView';
import KanbanView from '@/components/database/KanbanView';
import DatabaseToolbar from '@/components/database/DatabaseToolbar';

interface DatabaseViewEditProps {
  block: Block;
  readOnly?: boolean;
}

export default function DatabaseViewEdit({ block, readOnly = false }: DatabaseViewEditProps) {
  const content = block.content as DatabaseViewContent;
  const databaseId = content.databaseId;

  if (!databaseId) {
    return <DatabaseSearch block={block} readOnly={readOnly} />;
  }

  return <InlineDatabaseDisplay block={block} readOnly={readOnly} />;
}

/** Empty state: search for a database to embed */
function DatabaseSearch({ block, readOnly }: DatabaseViewEditProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { focusBlockId, setFocusBlock, updateBlock, deleteBlock } = useBlockStore();
  const { pages } = usePageStore();
  const { focusPreviousBlock, focusNextBlock } = useBlockContext();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(true);

  // Handle focus
  useEffect(() => {
    if (focusBlockId === block.id) {
      inputRef.current?.focus();
      setFocusBlock(null);
    }
  }, [focusBlockId, block.id, setFocusBlock]);

  // Filter to only database pages
  const filteredPages = useMemo(() => {
    const databasePages = Array.from(pages.values()).filter((p) => p.type === 'database');
    if (!query) return databasePages.slice(0, 10);
    const q = query.toLowerCase();
    return databasePages
      .filter((p) => p.title.toLowerCase().includes(q) || p.id.includes(q))
      .slice(0, 10);
  }, [pages, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const selectDatabase = useCallback(
    (selectedDatabaseId: string) => {
      updateBlock(block.id, { content: { databaseId: selectedDatabaseId } });
      setShowDropdown(false);
    },
    [block.id, updateBlock]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (readOnly) return;

      switch (e.key) {
        case 'ArrowDown':
          if (showDropdown && filteredPages.length > 0) {
            e.preventDefault();
            setSelectedIndex((prev) => (prev < filteredPages.length - 1 ? prev + 1 : 0));
          } else {
            e.preventDefault();
            focusNextBlock();
          }
          break;
        case 'ArrowUp':
          if (showDropdown && filteredPages.length > 0) {
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredPages.length - 1));
          } else {
            e.preventDefault();
            focusPreviousBlock();
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (showDropdown && filteredPages[selectedIndex]) {
            selectDatabase(filteredPages[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowDropdown(false);
          break;
        case 'Backspace':
          if (query === '') {
            e.preventDefault();
            focusPreviousBlock();
            deleteBlock(block.id);
          }
          break;
      }
    },
    [readOnly, showDropdown, filteredPages, selectedIndex, query, block.id, focusNextBlock, focusPreviousBlock, selectDatabase, deleteBlock]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setShowDropdown(true);
    },
    []
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative" data-block-type="database_view">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowDropdown(true)}
        placeholder="Search for a database..."
        className="w-full px-3 py-2 text-sm border border-notion-border rounded-md outline-none focus:ring-2 focus:ring-blue-200 bg-white"
        readOnly={readOnly}
      />
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg border border-notion-border py-1 max-h-[240px] overflow-y-auto">
          {filteredPages.length === 0 ? (
            <div className="px-3 py-2 text-sm text-notion-text-secondary">
              No databases found
            </div>
          ) : (
            filteredPages.map((page, index) => (
              <button
                key={page.id}
                onClick={() => selectDatabase(page.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
                  index === selectedIndex ? 'bg-notion-hover' : 'hover:bg-notion-hover'
                }`}
              >
                <span className="text-sm">{page.icon || '🗃️'}</span>
                <span className="text-sm text-notion-text truncate">{page.title || 'Untitled'}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Linked state: display the database inline */
function InlineDatabaseDisplay({ block, readOnly }: DatabaseViewEditProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const content = block.content as DatabaseViewContent;
  const navigate = useNavigate();
  const { focusBlockId, setFocusBlock, deleteBlock } = useBlockStore();
  const { pages } = usePageStore();
  const { focusPreviousBlock, focusNextBlock } = useBlockContext();
  const storeRef = useRef(createDatabaseInstanceStore(block.id));

  const databasePage = pages.get(content.databaseId);
  const isDeleted = !databasePage;
  const isNotDatabase = databasePage && databasePage.type !== 'database';

  // Handle focus
  useEffect(() => {
    if (focusBlockId === block.id) {
      divRef.current?.focus();
      setFocusBlock(null);
    }
  }, [focusBlockId, block.id, setFocusBlock]);

  // Load database data
  useEffect(() => {
    if (databasePage && databasePage.type === 'database') {
      const store = storeRef.current.getState();
      store.loadDatabase(databasePage);
      store.fetchRows();
    }
  }, [databasePage]);

  // Re-load when schema changes
  useEffect(() => {
    if (databasePage?.databaseSchema) {
      storeRef.current.getState().loadDatabase(databasePage);
    }
  }, [databasePage?.databaseSchema]);

  const handleNavigate = useCallback(() => {
    if (!isDeleted && !isNotDatabase) {
      navigate(`/page/${content.databaseId}`);
    }
  }, [isDeleted, isNotDatabase, content.databaseId, navigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Only handle keys when the outer container itself is focused (not child inputs)
      if (e.target !== divRef.current) return;
      if (readOnly) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          focusPreviousBlock();
          break;
        case 'ArrowDown':
          e.preventDefault();
          focusNextBlock();
          break;
        case 'Enter':
          e.preventDefault();
          handleNavigate();
          break;
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          focusPreviousBlock();
          deleteBlock(block.id);
          break;
      }
    },
    [readOnly, block.id, focusPreviousBlock, focusNextBlock, handleNavigate, deleteBlock]
  );

  if (isDeleted) {
    return (
      <div
        ref={divRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 outline-none focus:ring-2 focus:ring-blue-200 cursor-default"
        data-block-type="database_view"
      >
        <span className="text-sm text-red-400">Database not found</span>
      </div>
    );
  }

  if (isNotDatabase) {
    return (
      <div
        ref={divRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-50 border border-yellow-200 outline-none focus:ring-2 focus:ring-blue-200 cursor-default"
        data-block-type="database_view"
      >
        <span className="text-sm text-yellow-600">Not a database</span>
      </div>
    );
  }

  const title = databasePage.title || 'Untitled';
  const icon = databasePage.icon || '🗃️';

  return (
    <div
      ref={divRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="border border-notion-border rounded-md outline-none focus:ring-2 focus:ring-blue-200 overflow-hidden"
      data-block-type="database_view"
    >
      {/* Header bar */}
      <div
        onClick={handleNavigate}
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-notion-border cursor-pointer hover:bg-gray-100"
      >
        <span className="text-sm">{icon}</span>
        <span className="text-sm font-medium text-notion-text">{title}</span>
        <svg className="w-3.5 h-3.5 text-notion-text-secondary ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>

      {/* Database content */}
      <DatabaseInstanceProvider store={storeRef.current}>
        <InlineDatabaseContent readOnly={readOnly ?? false} />
      </DatabaseInstanceProvider>
    </div>
  );
}

function InlineDatabaseContent({ readOnly }: { readOnly: boolean }) {
  const { isLoading, error, viewConfig } = useDatabaseInstance();
  const canEdit = !readOnly;

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50">
        Error loading database: {error}
      </div>
    );
  }

  return (
    <div>
      <DatabaseToolbar canEdit={canEdit} />
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-notion-text-secondary">
          Loading...
        </div>
      ) : viewConfig.viewType === 'kanban' ? (
        <KanbanView canEdit={canEdit} />
      ) : (
        <TableView canEdit={canEdit} />
      )}
    </div>
  );
}
