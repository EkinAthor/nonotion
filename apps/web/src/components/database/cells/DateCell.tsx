import { useState, useRef, useEffect } from 'react';

interface DateCellProps {
  value: string | null;
  onChange: (value: string | null) => void;
  canEdit: boolean;
  rowId: string;
}

export default function DateCell({ value, onChange, canEdit }: DateCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue || null);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (!canEdit) {
    return (
      <div className="py-0.5">
        {value ? (
          <span>{formatDate(value)}</span>
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
        type="date"
        value={value || ''}
        onChange={handleChange}
        onBlur={() => setIsEditing(false)}
        className="px-1 py-0.5 bg-white border border-blue-500 rounded outline-none text-sm"
      />
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      className="py-0.5 cursor-pointer hover:bg-gray-100 rounded px-1 min-h-[24px]"
    >
      {value ? (
        <span>{formatDate(value)}</span>
      ) : (
        <span className="text-notion-text-secondary">Empty</span>
      )}
    </div>
  );
}
