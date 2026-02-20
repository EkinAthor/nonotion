import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/stores/uiStore';
import { usePageStore } from '@/stores/pageStore';
import { searchApi, type SearchResult } from '@/api/client';

export default function SearchModal() {
  const navigate = useNavigate();
  const { searchOpen, setSearchOpen } = useUiStore();
  const { pages } = usePageStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Build default results from local pages (starred first, then recent)
  const getDefaultResults = useCallback((): SearchResult[] => {
    const allPages = Array.from(pages.values())
      .filter(p => !p.parentId || p.type === 'database') // top-level or databases
      .sort((a, b) => {
        if (a.isStarred && !b.isStarred) return -1;
        if (!a.isStarred && b.isStarred) return 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, 10);

    return allPages.map(p => ({
      type: 'page' as const,
      pageId: p.id,
      pageTitle: p.title,
      pageIcon: p.icon,
      pageType: p.type,
      matchText: p.title,
      isStarred: p.isStarred,
    }));
  }, [pages]);

  // Reset on open
  useEffect(() => {
    if (searchOpen) {
      setQuery('');
      setResults(getDefaultResults());
      setSelectedIndex(0);
      setIsLoading(false);
      // Focus input after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchOpen, getDefaultResults]);

  // Debounced search
  useEffect(() => {
    if (!searchOpen) return;

    if (!query.trim()) {
      setResults(getDefaultResults());
      setSelectedIndex(0);
      return;
    }

    setIsLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchApi.search(query.trim());
        setResults(data);
        setSelectedIndex(0);
      } catch {
        // Keep current results on error
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchOpen, getDefaultResults]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.children;
    if (items[selectedIndex]) {
      (items[selectedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback((result: SearchResult) => {
    setSearchOpen(false);
    navigate(`/page/${result.pageId}`);
  }, [navigate, setSearchOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchOpen(false);
    }
  }, [results, selectedIndex, handleSelect, setSearchOpen]);

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setSearchOpen(false)}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg mx-4 h-fit">
        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center px-4 py-3 border-b border-notion-border">
            <svg
              className="w-5 h-5 text-notion-text-secondary mr-3 flex-shrink-0"
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
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search pages, blocks, and properties..."
              className="flex-1 text-sm text-notion-text placeholder-notion-text-secondary outline-none bg-transparent"
            />
            {isLoading && (
              <svg className="w-4 h-4 mr-2 animate-spin text-notion-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <kbd className="ml-2 px-1.5 py-0.5 text-xs text-notion-text-secondary bg-gray-100 rounded border border-gray-200 flex-shrink-0">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-auto">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-notion-text-secondary">
                {query.trim() ? 'No results found' : 'No pages yet'}
              </div>
            ) : (
              results.map((result, index) => (
                <button
                  key={`${result.pageId}-${result.type}-${result.blockId ?? ''}`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center px-4 py-2.5 text-left gap-3 ${
                    index === selectedIndex ? 'bg-notion-hover' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Icon */}
                  <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm">
                    {result.pageIcon ? (
                      result.pageIcon
                    ) : result.pageType === 'database' ? (
                      <svg className="w-4 h-4 text-notion-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-notion-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-notion-text truncate">
                        {result.pageTitle || 'Untitled'}
                      </span>
                      {result.pageType === 'database' && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium text-notion-text-secondary bg-gray-100 rounded">
                          Database
                        </span>
                      )}
                      {result.isStarred && (
                        <svg className="flex-shrink-0 w-3 h-3 text-yellow-400 fill-current" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      )}
                    </div>
                    {result.type !== 'page' && (
                      <p className="text-xs text-notion-text-secondary truncate mt-0.5">
                        {result.matchText}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer with keyboard hints */}
          {results.length > 0 && (
            <div className="px-4 py-2 border-t border-notion-border flex items-center gap-4 text-xs text-notion-text-secondary">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-[10px]">↑</kbd>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-[10px]">↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-[10px]">↵</kbd>
                Open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-[10px]">Esc</kbd>
                Close
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
