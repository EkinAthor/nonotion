import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export interface OptionPickerItem {
  id: string;
  /** Full row content. Receives whether this row is currently keyboard-highlighted. */
  render: (state: { highlighted: boolean }) => React.ReactNode;
  isSelected?: boolean;
  /** e.g. a row currently in inline-rename mode: skip it in keyboard navigation. */
  disabledNav?: boolean;
}

export interface OptionPickerMenuProps {
  open: boolean;
  /** Cell container to anchor/position the dropdown against. */
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;

  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  /** Already-filtered items (the parent owns filtering / server search). */
  items: OptionPickerItem[];
  onSelect: (id: string) => void;
  /** Cap on rendered rows so a huge list never floods the DOM. */
  maxRendered?: number;

  /** Create-new affordance. Parent passes null/empty to hide it (exact match or empty). */
  createText?: string | null;
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => React.ReactNode;

  loading?: boolean;
  emptyLabel?: React.ReactNode;
  minWidth?: number;
  /** Reserved for future single-select adoption; when true, close after a select. */
  closeOnSelect?: boolean;
}

type NavRow = { kind: 'item'; id: string } | { kind: 'create' };

export default function OptionPickerMenu({
  open,
  anchorRef,
  onClose,
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  items,
  onSelect,
  maxRendered = 100,
  createText,
  onCreate,
  createLabel,
  loading = false,
  emptyLabel,
  minWidth = 200,
  closeOnSelect = false,
}: OptionPickerMenuProps) {
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [highlight, setHighlight] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rendered = items.slice(0, maxRendered);
  const truncated = items.length > rendered.length;
  const trimmedCreate = createText?.trim() ?? '';
  const showCreate = trimmedCreate.length > 0 && !!onCreate;

  const navRows: NavRow[] = [
    ...rendered.filter((i) => !i.disabledNav).map((i) => ({ kind: 'item' as const, id: i.id })),
    ...(showCreate ? [{ kind: 'create' as const }] : []),
  ];
  const createNavIndex = showCreate ? navRows.length - 1 : -1;

  // Close on outside click (accounts for the portal-rendered dropdown).
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        anchorRef.current && !anchorRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Position the portal dropdown as fixed relative to the cell so it is never
  // clipped by the (possibly short) database view container.
  const updatePosition = () => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const dropdownHeight = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const style: React.CSSProperties = {
      position: 'fixed',
      left: rect.left,
      minWidth: Math.max(minWidth, rect.width),
      zIndex: 50,
    };
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      style.bottom = window.innerHeight - rect.top + 4;
    } else {
      style.top = rect.bottom + 4;
    }
    setDropdownStyle(style);
  };

  // Position + focus after position is computed (avoids page scroll on focus).
  useLayoutEffect(() => {
    if (open) {
      updatePosition();
      setHighlight(-1);
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reposition while the database view scrolls or the window resizes.
  useEffect(() => {
    if (!open) return;
    const main = document.querySelector('main');
    const handle = () => updatePosition();
    main?.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
    return () => {
      main?.removeEventListener('scroll', handle);
      window.removeEventListener('resize', handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clamp the highlight when filtering shrinks the navigable list.
  useEffect(() => {
    setHighlight((h) => (h >= navRows.length ? navRows.length - 1 : h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRows.length]);

  const activate = (row: NavRow | undefined) => {
    if (!row) return;
    if (row.kind === 'create') {
      onCreate?.(trimmedCreate);
    } else {
      onSelect(row.id);
    }
    onSearchChange('');
    setHighlight(-1);
    if (closeOnSelect) {
      onClose();
    } else {
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, navRows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(navRows[highlight === -1 ? 0 : highlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  const hasContent = rendered.length > 0 || showCreate;

  return createPortal(
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="bg-white border border-notion-border rounded-md shadow-lg max-h-[300px] overflow-hidden flex flex-col"
    >
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={searchPlaceholder}
        className="px-2 py-1.5 text-sm border-b border-notion-border outline-none"
      />

      <div className="overflow-y-auto">
        {loading ? (
          <div className="px-2 py-2 text-sm text-notion-text-secondary">Loading...</div>
        ) : !hasContent ? (
          <div className="px-2 py-2 text-sm text-notion-text-secondary">
            {emptyLabel ?? 'No results'}
          </div>
        ) : (
          <>
            {rendered.map((item) => {
              const navIndex = navRows.findIndex((r) => r.kind === 'item' && r.id === item.id);
              const highlighted = navIndex !== -1 && navIndex === highlight;
              return (
                <div
                  key={item.id}
                  onMouseEnter={() => !item.disabledNav && navIndex !== -1 && setHighlight(navIndex)}
                  onClick={(e) => {
                    if (item.disabledNav) return;
                    e.stopPropagation();
                    activate({ kind: 'item', id: item.id });
                  }}
                  className={highlighted ? 'bg-notion-hover' : ''}
                >
                  {item.render({ highlighted })}
                </div>
              );
            })}

            {showCreate && (
              <button
                onMouseEnter={() => setHighlight(createNavIndex)}
                onClick={(e) => {
                  e.stopPropagation();
                  activate({ kind: 'create' });
                }}
                className={`w-full px-2 py-1.5 flex items-center gap-1 text-left text-sm border-t border-notion-border ${
                  highlight === createNavIndex ? 'bg-notion-hover' : 'hover:bg-notion-hover'
                }`}
              >
                {createLabel ? (
                  createLabel(trimmedCreate)
                ) : (
                  <>
                    <span className="text-notion-text-secondary">Create</span>
                    <span className="font-medium">&quot;{trimmedCreate}&quot;</span>
                  </>
                )}
              </button>
            )}
          </>
        )}

        {truncated && (
          <div className="px-2 py-1.5 text-xs text-notion-text-secondary border-t border-notion-border">
            Showing first {maxRendered}. Keep typing to narrow.
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
