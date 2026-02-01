import { useState, useEffect, useRef, useMemo } from 'react';
import type { PublicUser, PermissionLevel, PagePermission } from '@nonotion/shared';
import { sharesApi, usersApi } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

interface ShareWithUser extends PagePermission {
  user: PublicUser | null;
}

interface PendingChange {
  type: 'add' | 'update' | 'remove';
  userId: string;
  level?: PermissionLevel;
  user?: PublicUser;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageId: string;
  pageTitle: string;
}

export default function ShareModal({ isOpen, onClose, pageId, pageTitle }: ShareModalProps) {
  const { user: currentUser } = useAuthStore();
  const [serverShares, setServerShares] = useState<ShareWithUser[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Compute effective shares (server state + pending changes)
  const effectiveShares = useMemo(() => {
    const result: ShareWithUser[] = [];

    // Start with server shares
    for (const share of serverShares) {
      const pending = pendingChanges.get(share.userId);
      if (pending?.type === 'remove') {
        // Skip removed shares
        continue;
      }
      if (pending?.type === 'update' && pending.level) {
        // Apply level update
        result.push({ ...share, level: pending.level });
      } else {
        result.push(share);
      }
    }

    // Add new shares from pending
    for (const [userId, change] of pendingChanges) {
      if (change.type === 'add' && change.level && change.user) {
        result.push({
          pageId,
          userId,
          level: change.level,
          grantedBy: currentUser?.id || '',
          grantedAt: new Date().toISOString(),
          user: change.user,
        });
      }
    }

    return result;
  }, [serverShares, pendingChanges, pageId, currentUser?.id]);

  const hasChanges = pendingChanges.size > 0;

  // Load shares when modal opens
  useEffect(() => {
    if (isOpen) {
      loadShares();
      setPendingChanges(new Map());
    }
  }, [isOpen, pageId]);

  // Debounced user search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const users = await usersApi.search(searchQuery);
        // Filter out users who already have access (including pending adds) and current user
        const existingUserIds = new Set(effectiveShares.map((s) => s.userId));
        setSearchResults(
          users.filter((u) => !existingUserIds.has(u.id) && u.id !== currentUser?.id)
        );
      } catch {
        // Ignore search errors
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery, effectiveShares, currentUser?.id]);

  const loadShares = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await sharesApi.getByPage(pageId);
      setServerShares(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddShare = (user: PublicUser, level: PermissionLevel = 'viewer') => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(user.id, { type: 'add', userId: user.id, level, user });
      return next;
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleUpdateLevel = (userId: string, level: PermissionLevel) => {
    const serverShare = serverShares.find((s) => s.userId === userId);

    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = prev.get(userId);

      if (existing?.type === 'add') {
        // Updating a pending add
        next.set(userId, { ...existing, level });
      } else if (serverShare) {
        // Updating an existing server share
        if (serverShare.level === level) {
          // Same as server - remove pending change
          next.delete(userId);
        } else {
          next.set(userId, { type: 'update', userId, level });
        }
      }
      return next;
    });
  };

  const handleRemoveShare = (userId: string) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = prev.get(userId);

      if (existing?.type === 'add') {
        // Removing a pending add - just delete it
        next.delete(userId);
      } else {
        // Removing an existing share
        next.set(userId, { type: 'remove', userId });
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    setError(null);

    try {
      // Process all pending changes
      for (const [userId, change] of pendingChanges) {
        if (change.type === 'add' && change.level) {
          await sharesApi.create(pageId, { userId, level: change.level });
        } else if (change.type === 'update' && change.level) {
          await sharesApi.update(pageId, userId, { level: change.level });
        } else if (change.type === 'remove') {
          await sharesApi.delete(pageId, userId);
        }
      }

      // Reload shares from server
      await loadShares();
      setPendingChanges(new Map());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setPendingChanges(new Map());
    onClose();
  };

  if (!isOpen) return null;

  const owner = effectiveShares.find((s) => s.level === 'owner');
  const nonOwnerShares = effectiveShares.filter((s) => s.level !== 'owner');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-notion-border">
          <div>
            <h2 className="text-lg font-semibold text-notion-text">Share "{pageTitle}"</h2>
            <p className="text-sm text-notion-text-secondary mt-0.5">
              Invite people to collaborate on this page and its sub-pages
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-notion-hover text-notion-text-secondary"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
              {error}
            </div>
          )}

          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email..."
              className="w-full px-3 py-2 border border-notion-border rounded-md bg-white text-notion-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-notion-text-secondary text-sm">
                Searching...
              </div>
            )}

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-notion-border rounded-md shadow-lg max-h-48 overflow-auto z-10">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleAddShare(user)}
                    className="flex items-center gap-3 w-full px-3 py-2 hover:bg-notion-hover text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-medium flex items-center justify-center">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-notion-text">{user.name}</div>
                      <div className="text-xs text-notion-text-secondary">{user.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current shares */}
          {isLoading ? (
            <div className="text-center py-4 text-notion-text-secondary">Loading...</div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-notion-text">People with access</h3>

              {/* Owner */}
              {owner && owner.user && (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-medium flex items-center justify-center">
                      {owner.user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-notion-text">
                        {owner.user.name}
                        {owner.userId === currentUser?.id && (
                          <span className="text-notion-text-secondary ml-1">(you)</span>
                        )}
                      </div>
                      <div className="text-xs text-notion-text-secondary">{owner.user.email}</div>
                    </div>
                  </div>
                  <span className="text-sm text-notion-text-secondary">Owner</span>
                </div>
              )}

              {/* Other shares */}
              {nonOwnerShares.map((share) => {
                const isPending = pendingChanges.has(share.userId);
                const pendingChange = pendingChanges.get(share.userId);
                const isNew = pendingChange?.type === 'add';

                return (
                  <div
                    key={share.userId}
                    className={`flex items-center justify-between py-2 ${isPending ? 'bg-yellow-50 -mx-2 px-2 rounded' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${isNew ? 'bg-green-500' : 'bg-gray-500'} text-white text-sm font-medium flex items-center justify-center`}>
                        {share.user?.name.slice(0, 2).toUpperCase() || '??'}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-notion-text">
                          {share.user?.name || 'Unknown user'}
                          {isNew && <span className="text-green-600 ml-1">(new)</span>}
                          {pendingChange?.type === 'update' && <span className="text-yellow-600 ml-1">(modified)</span>}
                        </div>
                        <div className="text-xs text-notion-text-secondary">
                          {share.user?.email || share.userId}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={share.level}
                        onChange={(e) => handleUpdateLevel(share.userId, e.target.value as PermissionLevel)}
                        className="text-sm border border-notion-border rounded px-2 py-1 bg-white"
                      >
                        <option value="viewer">Can view</option>
                        <option value="editor">Can edit</option>
                        <option value="full_access">Full access</option>
                      </select>
                      <button
                        onClick={() => handleRemoveShare(share.userId)}
                        className="p-1 rounded hover:bg-notion-hover text-notion-text-secondary"
                        title="Remove access"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {effectiveShares.length === 0 && (
                <div className="text-center py-4 text-notion-text-secondary text-sm">
                  No one has access to this page yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Apply button */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-notion-border bg-gray-50 rounded-b-lg">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-notion-text-secondary hover:bg-notion-hover rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!hasChanges || isSaving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
