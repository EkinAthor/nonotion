import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { IS_DEMO_MODE } from '@/api/client';
import AccountSettingsModal from '@/components/auth/AccountSettingsModal';

export default function UserMenu() {
  const navigate = useNavigate();
  const { user, logout, isAdmin, isOwner } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-2 py-2 hover:bg-notion-hover rounded-md"
      >
        {/* Avatar */}
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-6 h-6 rounded-full"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-medium flex items-center justify-center">
            {initials}
          </div>
        )}

        {/* Name */}
        <span className="flex-1 text-sm text-notion-text truncate text-left">
          {user.name}
        </span>

        {/* Role badge */}
        {isOwner() ? (
          <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
            Owner
          </span>
        ) : isAdmin() ? (
          <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
            Admin
          </span>
        ) : null}

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-notion-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-notion-border rounded-md shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-notion-border">
            <div className="text-sm font-medium text-notion-text">{user.name}</div>
            <div className="text-xs text-notion-text-secondary">{user.email}</div>
          </div>

          {isAdmin() && !IS_DEMO_MODE && (
            <div className="py-1 border-b border-notion-border">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/admin/users');
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-notion-text hover:bg-notion-hover"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Manage Users
              </button>
            </div>
          )}

          {!IS_DEMO_MODE && (
            <div className="py-1 border-b border-notion-border">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowSettings(true);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-notion-text hover:bg-notion-hover"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Account settings
              </button>
            </div>
          )}

          <div className="py-1">
            {IS_DEMO_MODE ? (
              <div className="flex items-center gap-2 w-full px-3 py-2 text-sm text-notion-text-secondary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Demo Mode — data saved in browser
              </div>
            ) : (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-notion-text hover:bg-notion-hover"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign out
              </button>
            )}
          </div>
        </div>
      )}

      <AccountSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
