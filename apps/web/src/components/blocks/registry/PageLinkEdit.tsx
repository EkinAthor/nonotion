import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Block, PageLinkContent } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { usePageStore } from '@/stores/pageStore';
import { useBlockContext } from '@/contexts/BlockContext';

interface PageLinkEditProps {
  block: Block;
  readOnly?: boolean;
}

export default function PageLinkEdit({ block, readOnly = false }: PageLinkEditProps) {
  const content = block.content as PageLinkContent;
  const linkedPageId = content.linkedPageId;

  if (!linkedPageId) {
    return <PageLinkSearch block={block} readOnly={readOnly} />;
  }

  return <PageLinkDisplay block={block} readOnly={readOnly} />;
}

/** Empty state: search for a page to link */
function PageLinkSearch({ block, readOnly }: PageLinkEditProps) {
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

  // Filter pages based on query
  const filteredPages = useMemo(() => {
    const allPages = Array.from(pages.values());
    if (!query) return allPages.slice(0, 10);
    const q = query.toLowerCase();
    return allPages
      .filter((p) => p.title.toLowerCase().includes(q) || p.id.includes(q))
      .slice(0, 10);
  }, [pages, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const selectPage = useCallback(
    (selectedPageId: string) => {
      updateBlock(block.id, { content: { linkedPageId: selectedPageId } });
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
            selectPage(filteredPages[selectedIndex].id);
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
    [readOnly, showDropdown, filteredPages, selectedIndex, query, block.id, focusNextBlock, focusPreviousBlock, selectPage, deleteBlock]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setShowDropdown(true);

      // Auto-detect pasted pg_ IDs
      const pgMatch = value.match(/pg_[a-zA-Z0-9]+/);
      if (pgMatch && pages.has(pgMatch[0])) {
        selectPage(pgMatch[0]);
      }
    },
    [pages, selectPage]
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
    <div ref={containerRef} className="relative" data-block-type="page_link">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowDropdown(true)}
        placeholder="Search for a page or paste a page link..."
        className="w-full px-3 py-2 text-sm border border-notion-border rounded-md outline-none focus:ring-2 focus:ring-blue-200 bg-white"
        readOnly={readOnly}
      />
      {showDropdown && filteredPages.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg border border-notion-border py-1 max-h-[240px] overflow-y-auto">
          {filteredPages.map((page, index) => (
            <button
              key={page.id}
              onClick={() => selectPage(page.id)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
                index === selectedIndex ? 'bg-notion-hover' : 'hover:bg-notion-hover'
              }`}
            >
              <span className="text-sm">{page.icon || '📄'}</span>
              <span className="text-sm text-notion-text truncate">{page.title || 'Untitled'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Linked state: display the linked page */
function PageLinkDisplay({ block, readOnly }: PageLinkEditProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const content = block.content as PageLinkContent;
  const navigate = useNavigate();
  const { focusBlockId, setFocusBlock, deleteBlock } = useBlockStore();
  const { pages } = usePageStore();
  const { focusPreviousBlock, focusNextBlock, pageId } = useBlockContext();

  const linkedPage = pages.get(content.linkedPageId);
  const isSubPage = linkedPage?.parentId === pageId;
  const isDeleted = !linkedPage;

  // Handle focus
  useEffect(() => {
    if (focusBlockId === block.id) {
      divRef.current?.focus();
      setFocusBlock(null);
    }
  }, [focusBlockId, block.id, setFocusBlock]);

  const handleClick = useCallback(() => {
    if (!isDeleted) {
      navigate(`/page/${content.linkedPageId}`);
    }
  }, [isDeleted, content.linkedPageId, navigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
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
          handleClick();
          break;
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          focusPreviousBlock();
          deleteBlock(block.id);
          break;
      }
    },
    [readOnly, block.id, focusPreviousBlock, focusNextBlock, handleClick, deleteBlock]
  );

  if (isDeleted) {
    return (
      <div
        ref={divRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 outline-none focus:ring-2 focus:ring-blue-200 cursor-default"
        data-block-type="page_link"
      >
        <span className="text-sm text-red-400 line-through">Deleted page</span>
      </div>
    );
  }

  const title = linkedPage.title || 'Untitled';
  const icon = linkedPage.icon || '📄';

  if (isSubPage) {
    // Sub-page style: clean, minimal
    return (
      <div
        ref={divRef}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-notion-hover outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
        data-block-type="page_link"
      >
        <span className="text-sm">{icon}</span>
        <span className="text-sm text-notion-text">{title}</span>
      </div>
    );
  }

  // External link style: border + link icon
  return (
    <div
      ref={divRef}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 border border-notion-border hover:bg-notion-hover outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
      data-block-type="page_link"
    >
      <svg className="w-4 h-4 text-notion-text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      <span className="text-sm">{icon}</span>
      <span className="text-sm text-notion-text">{title}</span>
    </div>
  );
}
