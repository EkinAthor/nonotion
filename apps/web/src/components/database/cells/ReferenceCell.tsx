import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { databaseApi } from '@/api/client';
import type { DatabaseRow, ResolvedReference } from '@nonotion/shared';

interface ReferenceCellProps {
  value: string[]; // referenced row ids
  resolved?: ResolvedReference; // server-resolved names + access (present in table/kanban views)
  referencedDatabaseId?: string;
  onChange: (value: string[]) => void;
  canEdit: boolean;
  rowId: string;
}

export default function ReferenceCell({
  value,
  resolved,
  referencedDatabaseId,
  onChange,
  canEdit,
}: ReferenceCellProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<DatabaseRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [accessError, setAccessError] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchCandidates = () => {
    if (!referencedDatabaseId || candidates || loading) return;
    setLoading(true);
    databaseApi
      .getRows(referencedDatabaseId, { limit: 1000 })
      .then((r) => setCandidates(r.rows))
      .catch(() => setAccessError(true))
      .finally(() => setLoading(false));
  };

  // When no server-resolved data is available (e.g. row-detail page), fetch
  // candidates so we can display referenced names.
  useEffect(() => {
    if (!resolved && referencedDatabaseId) fetchCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, referencedDatabaseId]);

  // Close on outside click (accounts for the portal-rendered dropdown).
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Position the portal dropdown as fixed relative to the cell so it is never
  // clipped by the (possibly short) database view container.
  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const style: React.CSSProperties = {
      position: 'fixed',
      left: rect.left,
      minWidth: Math.max(240, rect.width),
      zIndex: 50,
    };
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      style.bottom = window.innerHeight - rect.top + 4;
    } else {
      style.top = rect.bottom + 4;
    }
    setDropdownStyle(style);
  };

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Reposition while the database view scrolls.
  useEffect(() => {
    if (!isOpen) return;
    const main = document.querySelector('main');
    const handleScroll = () => updatePosition();
    main?.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      main?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Whether the viewer lacks access to the referenced database → render #ref.
  const redacted = resolved ? !resolved.accessible : accessError;

  // Names to display, always derived from the current `value` so edits (adding
  // or removing a reference) are reflected immediately without a refetch.
  const displayItems = useMemo<Array<{ id: string; name: string }>>(() => {
    if (redacted) return value.map((id) => ({ id, name: '#ref' }));
    const byId = candidates ? new Map(candidates.map((r) => [r.id, r.title])) : null;
    const resolvedById = new Map((resolved?.items ?? []).map((i) => [i.id, i.name]));
    const haveNames = !!candidates || !!resolved;
    return value.map((id) => ({
      id,
      name: byId?.get(id) || resolvedById.get(id) || (haveNames ? 'Untitled' : '…'),
    }));
  }, [redacted, resolved, candidates, value]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const filteredCandidates = useMemo(() => {
    if (!candidates) return [];
    const q = search.toLowerCase();
    return candidates.filter((r) => (r.title || 'Untitled').toLowerCase().includes(q));
  }, [candidates, search]);

  const chip = (item: { id: string; name: string }, clickable: boolean) => (
    <span
      key={item.id}
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation();
              navigate(`/page/${item.id}`);
            }
          : undefined
      }
      className={`inline-flex items-center max-w-full truncate rounded px-1.5 py-0.5 text-sm ${
        redacted
          ? 'bg-gray-100 text-notion-text-secondary'
          : clickable
            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer underline decoration-dotted'
            : 'bg-blue-50 text-blue-700'
      }`}
      title={redacted ? 'No access to referenced database' : item.name}
    >
      {item.name}
    </span>
  );

  // Read-only, or redacted (cannot edit references you can't resolve).
  if (!canEdit || redacted) {
    return (
      <div className="py-0.5 flex flex-wrap gap-1">
        {displayItems.length > 0 ? (
          displayItems.map((item) => chip(item, !redacted))
        ) : (
          <span className="text-notion-text-secondary">-</span>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
          fetchCandidates();
        }}
        className="py-0.5 px-1 min-h-[24px] cursor-pointer hover:bg-gray-100 rounded flex flex-wrap gap-1"
      >
        {displayItems.length > 0 ? (
          displayItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 max-w-full truncate rounded bg-blue-50 px-1.5 py-0.5 text-sm text-blue-700"
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/page/${item.id}`);
                }}
                className="truncate underline decoration-dotted hover:text-blue-900"
                title={item.name}
              >
                {item.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(item.id);
                }}
                className="text-blue-400 hover:text-blue-700"
                aria-label="Remove reference"
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-notion-text-secondary">Add reference...</span>
        )}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-white border border-notion-border rounded-md shadow-lg max-h-[280px] overflow-hidden flex flex-col"
          >
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Search records..."
              className="px-2 py-1.5 text-sm border-b border-notion-border outline-none"
            />
            <div className="overflow-y-auto">
              {loading ? (
                <div className="px-2 py-2 text-sm text-notion-text-secondary">Loading...</div>
              ) : filteredCandidates.length === 0 ? (
                <div className="px-2 py-2 text-sm text-notion-text-secondary">No records</div>
              ) : (
                filteredCandidates.map((r) => (
                  <button
                    key={r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(r.id);
                    }}
                    className={`w-full px-2 py-1 flex items-center gap-2 text-left hover:bg-notion-hover ${
                      value.includes(r.id) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span className="w-4 text-blue-600">{value.includes(r.id) ? '✓' : ''}</span>
                    <span className="text-sm truncate flex-1">{r.title || 'Untitled'}</span>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
