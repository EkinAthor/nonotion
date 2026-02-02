import { useState, useRef, useEffect } from 'react';
import { usersApi } from '@/api/client';
import type { PublicUser } from '@nonotion/shared';

interface PersonCellProps {
  value: string | null;
  onChange: (value: string | null) => void;
  canEdit: boolean;
  rowId: string;
}

export default function PersonCell({ value, onChange, canEdit }: PersonCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch users when dropdown opens
  useEffect(() => {
    if (isOpen && users.length === 0) {
      setIsLoading(true);
      usersApi.getAll()
        .then(setUsers)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, users.length]);

  // Fetch selected user info
  useEffect(() => {
    if (value && !selectedUser) {
      usersApi.get(value)
        .then(setSelectedUser)
        .catch(console.error);
    } else if (!value) {
      setSelectedUser(null);
    }
  }, [value, selectedUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 200; // Approximate max height
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setDropdownPosition('top');
      } else {
        setDropdownPosition('bottom');
      }
    }
  }, [isOpen]);

  const handleSelect = (userId: string | null) => {
    onChange(userId);
    if (userId) {
      const user = users.find((u) => u.id === userId);
      setSelectedUser(user || null);
    } else {
      setSelectedUser(null);
    }
    setIsOpen(false);
  };

  const getInitials = (user: PublicUser) => {
    return user.name
      ? user.name.charAt(0).toUpperCase()
      : user.email.charAt(0).toUpperCase();
  };

  if (!canEdit) {
    return (
      <div className="py-0.5">
        {selectedUser ? (
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium">
              {getInitials(selectedUser)}
            </div>
            <span className="text-sm">{selectedUser.name || selectedUser.email}</span>
          </div>
        ) : (
          <span className="text-notion-text-secondary">-</span>
        )}
      </div>
    );
  }

  const dropdownClasses = dropdownPosition === 'top'
    ? 'absolute left-0 bottom-full mb-1 bg-white border border-notion-border rounded-md shadow-lg z-20 min-w-[200px] max-h-[200px] overflow-y-auto'
    : 'absolute left-0 top-full mt-1 bg-white border border-notion-border rounded-md shadow-lg z-20 min-w-[200px] max-h-[200px] overflow-y-auto';

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="py-0.5 cursor-pointer hover:bg-gray-100 rounded px-1 min-h-[24px]"
      >
        {selectedUser ? (
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium">
              {getInitials(selectedUser)}
            </div>
            <span className="text-sm">{selectedUser.name || selectedUser.email}</span>
          </div>
        ) : (
          <span className="text-notion-text-secondary">Select person...</span>
        )}
      </div>

      {isOpen && (
        <div className={dropdownClasses}>
          {isLoading ? (
            <div className="px-2 py-2 text-sm text-notion-text-secondary">Loading...</div>
          ) : (
            <>
              {value && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(null);
                  }}
                  className="w-full px-2 py-1 text-sm text-left text-notion-text-secondary hover:bg-notion-hover"
                >
                  Clear
                </button>
              )}
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(user.id);
                  }}
                  className={`w-full px-2 py-1 flex items-center gap-2 text-left hover:bg-notion-hover ${
                    user.id === value ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium">
                    {getInitials(user)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{user.name || user.email}</div>
                    {user.name && (
                      <div className="text-xs text-notion-text-secondary truncate">{user.email}</div>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
