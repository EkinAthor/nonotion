import { useState, useRef, useEffect } from 'react';
import { usePageStore } from '@/stores/pageStore';
import { useDatabaseStore } from '@/stores/databaseStore';

interface TitleCellProps {
  value: string;
  onChange: (value: string) => void;
  canEdit: boolean;
  rowId: string;
}

export default function TitleCell({ value, onChange, canEdit, rowId }: TitleCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const { updatePage } = usePageStore();
  const { updateRowTitle } = useDatabaseStore();

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (localValue !== value) {
      // Update the page title directly (optimistic, fire-and-forget)
      updatePage(rowId, { title: localValue });
      // Also update the row in databaseStore
      updateRowTitle(rowId, localValue);
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

  if (!canEdit) {
    return (
      <span className={`block py-0.5 ${!value ? 'text-notion-text-secondary' : ''}`}>
        {value || 'Untitled'}
      </span>
    );
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full px-1 py-0.5 bg-white border border-blue-500 rounded outline-none"
        placeholder="Untitled"
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`block py-0.5 cursor-text hover:bg-gray-100 rounded px-1 ${
        !value ? 'text-notion-text-secondary' : ''
      }`}
    >
      {value || 'Untitled'}
    </span>
  );
}
