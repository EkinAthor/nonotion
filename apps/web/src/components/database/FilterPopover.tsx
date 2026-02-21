import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { PropertyDefinition, FilterRule, SelectOption, SelectColor, PublicUser } from '@nonotion/shared';
import { useDatabaseInstance } from '@/contexts/DatabaseInstanceContext';
import { usersApi } from '@/api/client';

const COLOR_CLASSES: Record<SelectColor, { bg: string; text: string }> = {
  gray: { bg: 'bg-gray-200', text: 'text-gray-700' },
  brown: { bg: 'bg-amber-200', text: 'text-amber-800' },
  orange: { bg: 'bg-orange-200', text: 'text-orange-800' },
  yellow: { bg: 'bg-yellow-200', text: 'text-yellow-800' },
  green: { bg: 'bg-green-200', text: 'text-green-800' },
  blue: { bg: 'bg-blue-200', text: 'text-blue-800' },
  purple: { bg: 'bg-purple-200', text: 'text-purple-800' },
  pink: { bg: 'bg-pink-200', text: 'text-pink-800' },
  red: { bg: 'bg-red-200', text: 'text-red-800' },
};

interface FilterPopoverProps {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function FilterPopover({ onClose, anchorRef }: FilterPopoverProps) {
  const { viewConfig, setFilters, getAllPropertiesOrdered } = useDatabaseInstance();
  const properties = getAllPropertiesOrdered();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate position from anchor element
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popoverHeight = 420; // approximate max height
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= popoverHeight
      ? rect.bottom + 4
      : Math.max(8, rect.top - popoverHeight - 4);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 340));
    setPosition({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        // Don't close if clicking the anchor button itself (toggle handles that)
        !anchorRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, anchorRef]);

  // Auto-apply: update store filters immediately
  const updateFiltersForProperty = useCallback((propertyId: string, rules: FilterRule[]) => {
    const others = viewConfig.filters.filter((f) => f.propertyId !== propertyId);
    setFilters([...others, ...rules]);
  }, [viewConfig.filters, setFilters]);

  if (!position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed bg-white border border-notion-border rounded-md shadow-lg z-[100] w-[320px] max-h-[420px] overflow-y-auto overflow-x-hidden"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-2 text-xs font-medium text-notion-text-secondary uppercase border-b border-notion-border">
        Filter by properties
      </div>

      <div className="p-2 space-y-3">
        {properties.map((prop) => (
          <FilterPropertyRow
            key={prop.id}
            property={prop}
            filters={viewConfig.filters}
            onUpdate={(rules) => updateFiltersForProperty(prop.id, rules)}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}

interface FilterPropertyRowProps {
  property: PropertyDefinition;
  filters: FilterRule[];
  onUpdate: (rules: FilterRule[]) => void;
}

function FilterPropertyRow({ property, filters, onUpdate }: FilterPropertyRowProps) {
  const currentRules = filters.filter((f) => f.propertyId === property.id);

  switch (property.type) {
    case 'title':
    case 'text':
    case 'url':
      return <TextFilterInput property={property} rules={currentRules} onUpdate={onUpdate} />;
    case 'date':
      return <DateRangeInput property={property} rules={currentRules} onUpdate={onUpdate} />;
    case 'select':
      return <TagFilterInput property={property} rules={currentRules} onUpdate={onUpdate} mode="select" />;
    case 'multi_select':
      return <TagFilterInput property={property} rules={currentRules} onUpdate={onUpdate} mode="multi_select" />;
    case 'person':
      return <PersonFilterInput property={property} rules={currentRules} onUpdate={onUpdate} />;
    case 'checkbox':
      return <CheckboxFilterInput property={property} rules={currentRules} onUpdate={onUpdate} />;
    default:
      return null;
  }
}

// Text filter: free-form input with "contains" operator
function TextFilterInput({
  property,
  rules,
  onUpdate,
}: {
  property: PropertyDefinition;
  rules: FilterRule[];
  onUpdate: (rules: FilterRule[]) => void;
}) {
  const current = rules.find((r) => r.operator === 'contains');
  const value = current?.value ?? '';

  return (
    <div>
      <div className="text-xs font-medium text-notion-text-secondary mb-1">{property.name}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v) {
            onUpdate([{ propertyId: property.id, operator: 'contains', value: v }]);
          } else {
            onUpdate([]);
          }
        }}
        placeholder="Contains..."
        className="w-full px-2 py-1 text-sm border border-gray-200 rounded outline-none focus:border-blue-400"
      />
    </div>
  );
}

// Date filter: two date inputs (from / to)
function DateRangeInput({
  property,
  rules,
  onUpdate,
}: {
  property: PropertyDefinition;
  rules: FilterRule[];
  onUpdate: (rules: FilterRule[]) => void;
}) {
  const gteRule = rules.find((r) => r.operator === 'gte');
  const lteRule = rules.find((r) => r.operator === 'lte');
  const fromValue = gteRule?.value ?? '';
  const toValue = lteRule?.value ?? '';

  const handleChange = (from: string, to: string) => {
    const newRules: FilterRule[] = [];
    if (from) {
      newRules.push({ propertyId: property.id, operator: 'gte', value: from });
    }
    if (to) {
      newRules.push({ propertyId: property.id, operator: 'lte', value: to });
    }
    onUpdate(newRules);
  };

  return (
    <div>
      <div className="text-xs font-medium text-notion-text-secondary mb-1">{property.name}</div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={fromValue}
          onChange={(e) => handleChange(e.target.value, toValue)}
          className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded outline-none focus:border-blue-400"
        />
        <span className="text-xs text-notion-text-secondary">to</span>
        <input
          type="date"
          value={toValue}
          onChange={(e) => handleChange(fromValue, e.target.value)}
          className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded outline-none focus:border-blue-400"
        />
      </div>
    </div>
  );
}

// Tag filter: input field that reveals searchable dropdown on focus
function TagFilterInput({
  property,
  rules,
  onUpdate,
  mode,
}: {
  property: PropertyDefinition;
  rules: FilterRule[];
  onUpdate: (rules: FilterRule[]) => void;
  mode: 'select' | 'multi_select';
}) {
  const options = property.options ?? [];
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // For multi_select: AND/OR toggle
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(() => {
    const rule = rules.find((r) => r.operator === 'all' || r.operator === 'any');
    return rule?.operator === 'all' ? 'all' : 'any';
  });

  // Get currently selected option IDs
  const getSelectedIds = (): string[] => {
    const rule = rules.find((r) => r.operator === 'in' || r.operator === 'all' || r.operator === 'any');
    if (!rule?.value) return [];
    return rule.value.split(',').filter(Boolean);
  };

  const selectedIds = getSelectedIds();
  const selectedOptions = selectedIds
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is SelectOption => o !== undefined);

  const filteredOptions = search
    ? options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleOption = (optionId: string) => {
    let newIds: string[];
    if (selectedIds.includes(optionId)) {
      newIds = selectedIds.filter((id) => id !== optionId);
    } else {
      newIds = [...selectedIds, optionId];
    }

    if (newIds.length === 0) {
      onUpdate([]);
    } else {
      const operator = mode === 'select' ? 'in' : matchMode;
      onUpdate([{ propertyId: property.id, operator, value: newIds.join(',') }]);
    }
  };

  const removeTag = (optionId: string) => {
    const newIds = selectedIds.filter((id) => id !== optionId);
    if (newIds.length === 0) {
      onUpdate([]);
    } else {
      const operator = mode === 'select' ? 'in' : matchMode;
      onUpdate([{ propertyId: property.id, operator, value: newIds.join(',') }]);
    }
  };

  const handleMatchModeChange = (newMode: 'all' | 'any') => {
    setMatchMode(newMode);
    if (selectedIds.length > 0) {
      onUpdate([{ propertyId: property.id, operator: newMode, value: selectedIds.join(',') }]);
    }
  };

  return (
    <div ref={containerRef}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-notion-text-secondary">{property.name}</span>
        {mode === 'multi_select' && selectedIds.length > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => handleMatchModeChange('any')}
              className={`px-1.5 py-0.5 rounded ${matchMode === 'any' ? 'bg-blue-100 text-blue-700' : 'text-notion-text-secondary hover:bg-gray-100'}`}
            >
              OR
            </button>
            <button
              onClick={() => handleMatchModeChange('all')}
              className={`px-1.5 py-0.5 rounded ${matchMode === 'all' ? 'bg-blue-100 text-blue-700' : 'text-notion-text-secondary hover:bg-gray-100'}`}
            >
              AND
            </button>
          </div>
        )}
      </div>

      {/* Selected tags + input */}
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1 border border-gray-200 rounded cursor-text min-h-[30px] focus-within:border-blue-400"
        onClick={() => { inputRef.current?.focus(); setIsOpen(true); }}
      >
        {selectedOptions.map((opt) => (
          <span
            key={opt.id}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-xs font-medium ${COLOR_CLASSES[opt.color].bg} ${COLOR_CLASSES[opt.color].text}`}
          >
            {opt.name}
            <button
              onClick={(e) => { e.stopPropagation(); removeTag(opt.id); }}
              className="hover:opacity-70 ml-0.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedIds.length === 0 ? 'Select tags...' : ''}
          className="flex-1 min-w-[60px] text-xs outline-none bg-transparent py-0.5"
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="mt-1 border border-gray-200 rounded bg-white shadow-sm max-h-[150px] overflow-y-auto">
          {filteredOptions.length === 0 ? (
            <div className="text-xs text-notion-text-secondary px-2 py-2">No matching tags</div>
          ) : (
            filteredOptions.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-2 px-2 py-1 hover:bg-notion-hover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(option.id)}
                  onChange={() => toggleOption(option.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <OptionBadge option={option} />
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Person filter: input field that reveals searchable dropdown on focus
function PersonFilterInput({
  property,
  rules,
  onUpdate,
}: {
  property: PropertyDefinition;
  rules: FilterRule[];
  onUpdate: (rules: FilterRule[]) => void;
}) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rule = rules.find((r) => r.operator === 'in');
  const selectedIds = rule?.value ? rule.value.split(',').filter(Boolean) : [];

  // Lazy-load users on first open
  useEffect(() => {
    if (isOpen && !loaded) {
      usersApi.getAll().then((data) => {
        setUsers(data);
        setLoaded(true);
      }).catch(() => setLoaded(true));
    }
  }, [isOpen, loaded]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedUsers = selectedIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is PublicUser => u !== undefined);

  const filteredUsers = search
    ? users.filter((u) =>
        (u.name || u.email).toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const toggleUser = (userId: string) => {
    let newIds: string[];
    if (selectedIds.includes(userId)) {
      newIds = selectedIds.filter((id) => id !== userId);
    } else {
      newIds = [...selectedIds, userId];
    }

    if (newIds.length === 0) {
      onUpdate([]);
    } else {
      onUpdate([{ propertyId: property.id, operator: 'in', value: newIds.join(',') }]);
    }
  };

  const removeUser = (userId: string) => {
    const newIds = selectedIds.filter((id) => id !== userId);
    if (newIds.length === 0) {
      onUpdate([]);
    } else {
      onUpdate([{ propertyId: property.id, operator: 'in', value: newIds.join(',') }]);
    }
  };

  return (
    <div ref={containerRef}>
      <div className="text-xs font-medium text-notion-text-secondary mb-1">{property.name}</div>

      {/* Selected users + input */}
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1 border border-gray-200 rounded cursor-text min-h-[30px] focus-within:border-blue-400"
        onClick={() => { inputRef.current?.focus(); setIsOpen(true); }}
      >
        {selectedUsers.map((user) => (
          <span
            key={user.id}
            className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-xs font-medium bg-purple-100 text-purple-700"
          >
            {user.name || user.email}
            <button
              onClick={(e) => { e.stopPropagation(); removeUser(user.id); }}
              className="hover:opacity-70 ml-0.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedIds.length === 0 ? 'Select users...' : ''}
          className="flex-1 min-w-[60px] text-xs outline-none bg-transparent py-0.5"
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="mt-1 border border-gray-200 rounded bg-white shadow-sm max-h-[150px] overflow-y-auto">
          {!loaded ? (
            <div className="text-xs text-notion-text-secondary px-2 py-2">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-xs text-notion-text-secondary px-2 py-2">No matching users</div>
          ) : (
            filteredUsers.map((user) => (
              <label
                key={user.id}
                className="flex items-center gap-2 px-2 py-1 hover:bg-notion-hover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs">{user.name || user.email}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Checkbox filter: three-state (Any / Checked / Unchecked)
function CheckboxFilterInput({
  property,
  rules,
  onUpdate,
}: {
  property: PropertyDefinition;
  rules: FilterRule[];
  onUpdate: (rules: FilterRule[]) => void;
}) {
  const rule = rules.find((r) => r.operator === 'eq');
  const current = rule?.value; // "true" | "false" | undefined (any)

  const handleChange = (value: string | undefined) => {
    if (value === undefined) {
      onUpdate([]);
    } else {
      onUpdate([{ propertyId: property.id, operator: 'eq', value }]);
    }
  };

  return (
    <div>
      <div className="text-xs font-medium text-notion-text-secondary mb-1">{property.name}</div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleChange(undefined)}
          className={`px-2 py-0.5 text-xs rounded ${current === undefined ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-notion-text-secondary hover:bg-gray-200'}`}
        >
          Any
        </button>
        <button
          onClick={() => handleChange('true')}
          className={`px-2 py-0.5 text-xs rounded ${current === 'true' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-notion-text-secondary hover:bg-gray-200'}`}
        >
          Checked
        </button>
        <button
          onClick={() => handleChange('false')}
          className={`px-2 py-0.5 text-xs rounded ${current === 'false' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-notion-text-secondary hover:bg-gray-200'}`}
        >
          Unchecked
        </button>
      </div>
    </div>
  );
}

// Reusable option badge
function OptionBadge({ option }: { option: SelectOption }) {
  const colors = COLOR_CLASSES[option.color];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
      {option.name}
    </span>
  );
}

// Helper to get human-readable summary of a filter rule
export function getFilterSummary(
  rule: FilterRule,
  properties: PropertyDefinition[],
  allUsers?: PublicUser[]
): string {
  const prop = properties.find((p) => p.id === rule.propertyId);
  if (!prop) return '';

  const propName = prop.name;

  switch (rule.operator) {
    case 'contains':
      return `${propName} contains "${rule.value}"`;
    case 'gte':
      return `${propName} from ${rule.value}`;
    case 'lte':
      return `${propName} to ${rule.value}`;
    case 'eq':
      if (prop.type === 'checkbox') {
        return `${propName}: ${rule.value === 'true' ? 'Checked' : 'Unchecked'}`;
      }
      return `${propName} = ${rule.value}`;
    case 'in': {
      const ids = rule.value?.split(',') ?? [];
      if (prop.type === 'person' && allUsers) {
        const names = ids.map((id) => allUsers.find((u) => u.id === id)?.name || id);
        return `${propName}: ${names.join(', ')}`;
      }
      if (prop.options) {
        const names = ids.map((id) => prop.options?.find((o) => o.id === id)?.name || id);
        return `${propName}: ${names.join(', ')}`;
      }
      return `${propName}: ${ids.length} selected`;
    }
    case 'all': {
      const ids = rule.value?.split(',') ?? [];
      const names = ids.map((id) => prop.options?.find((o) => o.id === id)?.name || id);
      return `${propName} has all: ${names.join(', ')}`;
    }
    case 'any': {
      const ids = rule.value?.split(',') ?? [];
      const names = ids.map((id) => prop.options?.find((o) => o.id === id)?.name || id);
      return `${propName} has any: ${names.join(', ')}`;
    }
    default:
      return `${propName}: ${rule.operator}`;
  }
}
