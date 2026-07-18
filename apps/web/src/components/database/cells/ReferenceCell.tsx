import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { databaseApi, pagesApi } from '@/api/client';
import { usePageStore } from '@/stores/pageStore';
import type { DatabaseRow, ResolvedReference } from '@nonotion/shared';
import OptionPickerMenu, { type OptionPickerItem } from './OptionPickerMenu';

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
  const [titlePropId, setTitlePropId] = useState<string | null>(null);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  // Accumulating id → name map so selected chips keep their names even when the
  // current (server-filtered) result set doesn't include them.
  const [nameCache, setNameCache] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  const redacted = resolved ? !resolved.accessible : accessError;

  const mergeNames = (rows: Array<{ id: string; title?: string }>) => {
    setNameCache((prev) => {
      const next = { ...prev };
      for (const r of rows) next[r.id] = r.title ?? '';
      return next;
    });
  };

  // Seed names from server-resolved data (table/kanban views).
  useEffect(() => {
    if (!resolved?.items?.length) return;
    setNameCache((prev) => {
      const next = { ...prev };
      for (const it of resolved.items) next[it.id] = it.name;
      return next;
    });
  }, [resolved]);

  // When there is no server-resolved data (e.g. row-detail page), best-effort
  // fetch names for display without loading the whole database.
  useEffect(() => {
    if (resolved || !referencedDatabaseId || value.length === 0) return;
    databaseApi
      .getRows(referencedDatabaseId, { limit: 100 })
      .then((r) => mergeNames(r.rows))
      .catch(() => setAccessError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, referencedDatabaseId]);

  // Resolve the referenced DB's title property id once (for server-side search).
  useEffect(() => {
    if (!isOpen || schemaLoaded || !referencedDatabaseId) return;
    let cancelled = false;
    pagesApi
      .get(referencedDatabaseId)
      .then((page) => {
        if (cancelled) return;
        const titleProp = page.databaseSchema?.properties.find((p) => p.type === 'title');
        setTitlePropId(titleProp?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setAccessError(true);
      })
      .finally(() => {
        if (!cancelled) setSchemaLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, schemaLoaded, referencedDatabaseId]);

  // Server-side search: fetch matching rows as the user types (debounced).
  useEffect(() => {
    if (!isOpen || !referencedDatabaseId || !schemaLoaded) return;
    const q = search.trim();
    const reqId = ++reqIdRef.current;
    setLoading(true);
    const t = setTimeout(
      () => {
        const opts =
          q && titlePropId
            ? { filter: `${titlePropId}:contains:${q}`, limit: 100 }
            : { limit: 100 };
        databaseApi
          .getRows(referencedDatabaseId, opts)
          .then((r) => {
            if (reqId !== reqIdRef.current) return; // ignore stale response
            setCandidates(r.rows);
            mergeNames(r.rows);
          })
          .catch(() => {
            if (reqId === reqIdRef.current) setAccessError(true);
          })
          .finally(() => {
            if (reqId === reqIdRef.current) setLoading(false);
          });
      },
      q ? 200 : 0
    );
    return () => clearTimeout(t);
  }, [isOpen, search, schemaLoaded, titlePropId, referencedDatabaseId]);

  const displayItems = useMemo<Array<{ id: string; name: string }>>(() => {
    if (redacted) return value.map((id) => ({ id, name: '#ref' }));
    const haveNames = Object.keys(nameCache).length > 0 || !!resolved;
    return value.map((id) => ({
      id,
      name: nameCache[id] || (haveNames ? 'Untitled' : '…'),
    }));
  }, [redacted, resolved, nameCache, value]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const handleCreatePage = async (text: string) => {
    if (!referencedDatabaseId) return;
    const title = text.trim();
    if (!title) return;
    const page = await usePageStore.getState().createPage({ title, parentId: referencedDatabaseId });
    const newRow: DatabaseRow = {
      id: page.id,
      title: page.title,
      icon: page.icon,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      properties: {},
    };
    setCandidates((prev) => (prev ? [...prev, newRow] : [newRow]));
    mergeNames([newRow]);
    onChange([...value, page.id]); // create + select
  };

  // When we couldn't resolve a title property id, filter client-side as a fallback.
  const q = search.trim().toLowerCase();
  const listRows = (candidates ?? []).filter((r) =>
    !titlePropId && q ? (r.title || 'Untitled').toLowerCase().includes(q) : true
  );

  const exactMatch = listRows.some((r) => (r.title || '').toLowerCase() === q);
  const createText = referencedDatabaseId && q && !exactMatch ? search.trim() : null;

  const items: OptionPickerItem[] = listRows.map((r) => ({
    id: r.id,
    isSelected: value.includes(r.id),
    render: () => (
      <div className="px-2 py-1 flex items-center gap-2 text-left">
        <span className="w-4 text-blue-600">{value.includes(r.id) ? '✓' : ''}</span>
        <span className="text-sm truncate flex-1">{r.title || 'Untitled'}</span>
      </div>
    ),
  }));

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

      <OptionPickerMenu
        open={isOpen}
        anchorRef={containerRef}
        onClose={() => {
          setIsOpen(false);
          setSearch('');
        }}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search or create a record..."
        items={items}
        onSelect={toggle}
        loading={loading}
        createText={createText}
        onCreate={handleCreatePage}
        createLabel={(text) => (
          <>
            <span className="text-notion-text-secondary">Create page</span>
            <span className="font-medium truncate">&quot;{text}&quot;</span>
          </>
        )}
        emptyLabel="No records"
        minWidth={240}
      />
    </div>
  );
}
