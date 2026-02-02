import { useState, useRef, useEffect } from 'react';

interface TextCellProps {
  value: string;
  onChange: (value: string) => void;
  canEdit: boolean;
  rowId: string;
}

export default function TextCell({ value, onChange, canEdit }: TextCellProps) {
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

  if (!canEdit) {
    return (
      <span className="block py-0.5 text-notion-text-secondary">
        {value || '-'}
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
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className="block py-0.5 cursor-text hover:bg-gray-100 rounded px-1 min-h-[24px]"
    >
      {value || <span className="text-notion-text-secondary">Empty</span>}
    </span>
  );
}
