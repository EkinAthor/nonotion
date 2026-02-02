import { useState, useRef, useEffect } from 'react';

interface UrlCellProps {
  value: string;
  onChange: (value: string) => void;
  canEdit: boolean;
  rowId: string;
}

export default function UrlCell({ value, onChange, canEdit }: UrlCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setLocalValue(value);
      setIsEditing(false);
    }
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value) {
      const url = value.startsWith('http') ? value : `https://${value}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!canEdit) {
    return (
      <div className="py-0.5">
        {value ? (
          <a
            href={value.startsWith('http') ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {value}
          </a>
        ) : (
          <span className="text-notion-text-secondary">-</span>
        )}
      </div>
    );
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="url"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full px-1 py-0.5 bg-white border border-blue-500 rounded outline-none"
        placeholder="https://..."
      />
    );
  }

  return (
    <div className="flex items-center gap-1 py-0.5 group">
      <span
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className={`flex-1 cursor-text hover:bg-gray-100 rounded px-1 truncate ${
          value ? 'text-blue-600' : 'text-notion-text-secondary'
        }`}
      >
        {value || 'Empty'}
      </span>
      {value && (
        <button
          onClick={handleLinkClick}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded"
          title="Open link"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      )}
    </div>
  );
}
