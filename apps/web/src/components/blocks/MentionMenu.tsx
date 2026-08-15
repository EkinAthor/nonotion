import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { PublicUser, Page } from '@nonotion/shared';
import type { MentionType } from '@/lib/tiptap/mention-node';
import { usersApi, searchApi } from '@/api/client';
import { usePageStore } from '@/stores/pageStore';
import { getRecentPageIds, getRecentUserIds } from '@/lib/mention-recents';

interface MentionMenuProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (kind: MentionType, id: string, label: string) => void;
  onClose: () => void;
}

type MenuRow =
  | { kind: 'user'; id: string; label: string; sublabel: string }
  | { kind: 'page'; id: string; label: string; icon: string }
  | { kind: 'dismiss' };

const MENU_MAX_HEIGHT = 320;
const MAX_PER_SECTION = 5;
const RECENTS_PER_SECTION = 2;
const SEARCH_DEBOUNCE_MS = 250;

function pageLabel(page: { title: string }): string {
  return page.title || 'Untitled';
}

/**
 * Inline "@" mention menu — Users and Pages sections plus a "Keep as plain
 * text" escape row. Same caret-anchored portal mechanics as SlashCommandMenu
 * (the editor keeps focus; a document-level keydown listener navigates).
 */
export default function MentionMenu({ query, position, onSelect, onClose }: MentionMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [serverPages, setServerPages] = useState<{ id: string; title: string; icon: string }[]>([]);
  const pages = usePageStore((s) => s.pages);
  const searchRequestIdRef = useRef(0);

  // Users: fetched once per menu open, filtered client-side
  useEffect(() => {
    let cancelled = false;
    usersApi
      .list()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pages: debounced server search to cover database row-pages that aren't in
  // the local store. Local results render instantly; server results merge in.
  const trimmedQuery = query.trim();
  useEffect(() => {
    if (!trimmedQuery) {
      setServerPages([]);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const results = await searchApi.search(trimmedQuery);
        if (searchRequestIdRef.current !== requestId) return;
        const q = trimmedQuery.toLowerCase();
        setServerPages(
          results
            .filter((r) => r.pageTitle.toLowerCase().includes(q))
            .map((r) => ({ id: r.pageId, title: r.pageTitle, icon: r.pageIcon || '📄' }))
        );
      } catch {
        // Search failure — local results still render
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  const rows = useMemo<MenuRow[]>(() => {
    const q = trimmedQuery.toLowerCase();

    let userItems: PublicUser[];
    let pageItems: { id: string; title: string; icon: string }[];

    if (q) {
      userItems = users
        .filter(
          (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        )
        .slice(0, MAX_PER_SECTION);

      const localMatches: { id: string; title: string; icon: string }[] = [];
      for (const page of pages.values()) {
        if (pageLabel(page).toLowerCase().includes(q)) {
          localMatches.push({ id: page.id, title: pageLabel(page), icon: page.icon || '📄' });
        }
      }
      const seen = new Set(localMatches.map((p) => p.id));
      pageItems = localMatches
        .concat(serverPages.filter((p) => !seen.has(p.id)))
        .slice(0, MAX_PER_SECTION);
    } else {
      // Empty query: 2 most recently used per section, padded to 2 with
      // newest-first fallbacks
      const userById = new Map(users.map((u) => [u.id, u]));
      const recentUsers = getRecentUserIds()
        .map((id) => userById.get(id))
        .filter((u): u is PublicUser => !!u);
      for (const u of users) {
        if (recentUsers.length >= RECENTS_PER_SECTION) break;
        if (!recentUsers.some((r) => r.id === u.id)) recentUsers.push(u);
      }
      userItems = recentUsers.slice(0, RECENTS_PER_SECTION);

      const recentPages = getRecentPageIds()
        .map((id) => pages.get(id))
        .filter((p): p is Page => !!p);
      if (recentPages.length < RECENTS_PER_SECTION) {
        const fallback = Array.from(pages.values())
          .filter((p) => !recentPages.some((r) => r.id === p.id))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        recentPages.push(...fallback.slice(0, RECENTS_PER_SECTION - recentPages.length));
      }
      pageItems = recentPages
        .slice(0, RECENTS_PER_SECTION)
        .map((p) => ({ id: p.id, title: pageLabel(p), icon: p.icon || '📄' }));
    }

    const result: MenuRow[] = [
      ...userItems.map<MenuRow>((u) => ({
        kind: 'user',
        id: u.id,
        label: u.name || u.email,
        sublabel: u.email,
      })),
      ...pageItems.map<MenuRow>((p) => ({
        kind: 'page',
        id: p.id,
        label: p.title,
        icon: p.icon,
      })),
      { kind: 'dismiss' },
    ];
    return result;
  }, [trimmedQuery, users, pages, serverPages]);

  const activateRow = useCallback(
    (row: MenuRow) => {
      if (row.kind === 'dismiss') {
        onClose();
      } else {
        onSelect(row.kind, row.id, row.label);
      }
    },
    [onSelect, onClose]
  );

  // Positioning — same below/above flip as SlashCommandMenu, anchored to the
  // caret coordinates so the menu stays attached as its height changes.
  const computePosition = useCallback(() => {
    const estimatedHeight = menuRef.current?.offsetHeight ?? MENU_MAX_HEIGHT;
    const left = Math.min(position.left, window.innerWidth - 280);
    const spaceBelow = window.innerHeight - position.top - 8;

    if (spaceBelow >= estimatedHeight || spaceBelow >= MENU_MAX_HEIGHT) {
      setMenuStyle({ position: 'fixed', top: position.top, left, bottom: 'auto' });
    } else {
      const anchorBottom = window.innerHeight - position.top + 24;
      setMenuStyle({ position: 'fixed', top: 'auto', bottom: Math.max(8, anchorBottom), left });
    }
  }, [position]);

  useLayoutEffect(() => {
    computePosition();
  }, [computePosition, rows.length]);

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const handleScroll = () => computePosition();
    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [computePosition]);

  // Reset selection when the row set changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, rows.length]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < rows.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : rows.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (rows[selectedIndex]) {
            activateRow(rows[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [rows, selectedIndex, activateRow, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close when clicking outside the menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const selected = menuRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const firstUserIndex = rows.findIndex((r) => r.kind === 'user');
  const firstPageIndex = rows.findIndex((r) => r.kind === 'page');
  const hasResults = rows.length > 1;

  const menuContent = (
    <div
      ref={menuRef}
      data-mention-menu
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-notion-border py-1 min-w-[240px] max-w-[320px] max-h-[320px] overflow-y-auto"
      style={menuStyle}
    >
      {!hasResults && (
        <div className="px-3 py-2 text-sm text-notion-text-secondary">No results</div>
      )}
      {rows.map((row, index) => {
        const isSelected = index === selectedIndex;
        const rowClasses = `flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
          isSelected ? 'bg-notion-hover' : 'hover:bg-notion-hover'
        }`;
        return (
          <div key={row.kind === 'dismiss' ? 'dismiss' : `${row.kind}:${row.id}`}>
            {index === firstUserIndex && (
              <div className="text-xs text-notion-text-secondary px-3 py-1 border-b border-notion-border mb-1">
                Users
              </div>
            )}
            {index === firstPageIndex && (
              <div className="text-xs text-notion-text-secondary px-3 py-1 border-b border-notion-border mb-1 mt-1">
                Pages
              </div>
            )}
            {row.kind === 'dismiss' && hasResults && (
              <div className="border-t border-notion-border my-1" />
            )}
            {row.kind === 'user' ? (
              <button data-selected={isSelected} onClick={() => activateRow(row)} className={rowClasses}>
                <span className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium shrink-0">
                  {row.label.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-notion-text truncate">{row.label}</span>
                  <span className="block text-xs text-notion-text-secondary truncate">
                    {row.sublabel}
                  </span>
                </span>
              </button>
            ) : row.kind === 'page' ? (
              <button data-selected={isSelected} onClick={() => activateRow(row)} className={rowClasses}>
                <span className="w-6 h-6 flex items-center justify-center text-sm shrink-0">
                  {row.icon}
                </span>
                <span className="text-sm text-notion-text truncate">{row.label}</span>
              </button>
            ) : (
              <button data-selected={isSelected} onClick={() => activateRow(row)} className={rowClasses}>
                <span className="text-sm text-notion-text-secondary">Keep as plain text</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  return createPortal(menuContent, document.body);
}
