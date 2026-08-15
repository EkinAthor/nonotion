import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PublicUser } from '@nonotion/shared';
import { usersApi } from '@/api/client';
import { useUiStore } from '@/stores/uiStore';

const POPOVER_HEIGHT_ESTIMATE = 76;

// Module-level cache — user identity rarely changes within a session
const userCache = new Map<string, PublicUser>();

function getInitials(user: PublicUser): string {
  return user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
}

/**
 * Small info popover shown when a user @-mention is clicked. Mounted once in
 * MainLayout; state (target user + anchor rect) lives in uiStore so the plain
 * JS mention NodeView can open it from any editor (editable or read-only).
 */
export default function UserMentionPopover() {
  const popover = useUiStore((s) => s.userMentionPopover);
  const closeUserMentionPopover = useUiStore((s) => s.closeUserMentionPopover);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const userId = popover?.userId ?? null;

  useEffect(() => {
    if (!userId) return;
    setNotFound(false);
    const cached = userCache.get(userId);
    if (cached) {
      setUser(cached);
      return;
    }
    setUser(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const fetched = await usersApi.get(userId);
        userCache.set(userId, fetched);
        if (!cancelled) setUser(fetched);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const computePosition = useCallback(() => {
    if (!popover) return;
    const { anchor } = popover;
    const height = popoverRef.current?.offsetHeight ?? POPOVER_HEIGHT_ESTIMATE;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 280));
    const spaceBelow = window.innerHeight - anchor.bottom - 8;
    if (spaceBelow >= height) {
      setStyle({ position: 'fixed', top: anchor.bottom + 4, left, bottom: 'auto' });
    } else {
      setStyle({
        position: 'fixed',
        top: 'auto',
        bottom: Math.max(8, window.innerHeight - anchor.top + 4),
        left,
      });
    }
  }, [popover]);

  useLayoutEffect(() => {
    computePosition();
  }, [computePosition, user, notFound]);

  // Close on click-outside and Escape
  useEffect(() => {
    if (!popover) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closeUserMentionPopover();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUserMentionPopover();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [popover, closeUserMentionPopover]);

  if (!popover) return null;

  return createPortal(
    <div
      ref={popoverRef}
      data-user-mention-popover
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-notion-border p-3 min-w-[220px] max-w-[280px]"
      style={style}
    >
      {notFound ? (
        <div className="text-sm text-notion-text-secondary">User no longer exists</div>
      ) : loading || !user ? (
        <div className="text-sm text-notion-text-secondary">Loading...</div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium shrink-0">
            {getInitials(user)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-notion-text truncate">
              {user.name || user.email}
            </div>
            <div className="text-xs text-notion-text-secondary truncate">{user.email}</div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
