interface CheckboxCellProps {
  value: boolean;
  onChange: (value: boolean) => void;
  canEdit: boolean;
  rowId: string;
}

export default function CheckboxCell({ value, onChange, canEdit }: CheckboxCellProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canEdit) {
      onChange(!value);
    }
  };

  return (
    <div
      className={`flex items-center justify-center ${canEdit ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
    >
      <div
        className={`w-4 h-4 border rounded flex items-center justify-center ${
          value
            ? 'bg-blue-500 border-blue-500'
            : 'border-gray-300 hover:border-gray-400'
        } ${!canEdit ? 'opacity-60' : ''}`}
      >
        {value && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    </div>
  );
}
