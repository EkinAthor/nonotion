import { useEffect, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { IS_DEMO_MODE } from '@/api/client';
import { initRealtimeManager } from '@/lib/realtime';
import ChangePasswordModal from './ChangePasswordModal';
import PendingApprovalPage from './PendingApprovalPage';

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  if (IS_DEMO_MODE) {
    return <>{children}</>;
  }
  return <AuthGuardInner>{children}</AuthGuardInner>;
}

function AuthGuardInner({ children }: AuthGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, mustChangePassword, pendingApproval, fetchCurrentUser, isLoading } = useAuthStore();
  // Reactive auth state: with persisted credentials we render children
  // immediately while fetchCurrentUser verifies in the background (no
  // isLoading flip, so no unmount/remount of the app tree). A failed verify
  // clears user/token, which re-runs the redirect effect below.
  const isAuthed = !!token && !!user;

  useEffect(() => {
    // Verify token is still valid on mount
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // Initialize realtime after authentication is confirmed.
  // The manager itself is idempotent — safe to call multiple times.
  // We intentionally DO NOT disconnect in cleanup to avoid StrictMode double-init loops.
  // Disconnect happens explicitly on logout (see authStore.logout).
  useEffect(() => {
    if (!isLoading && isAuthed) {
      initRealtimeManager();
    }
  }, [isLoading, isAuthed]);

  useEffect(() => {
    if (!isLoading && !isAuthed) {
      // Redirect to login, but save the intended destination (incl. query
      // params — the MCP OAuth consent page depends on them).
      navigate('/login', { state: { from: location.pathname + location.search }, replace: true });
    }
  }, [isLoading, isAuthed, navigate, location.pathname, location.search]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-notion-bg">
        <div className="text-notion-text-secondary">Loading...</div>
      </div>
    );
  }

  // If not authenticated, return null (will redirect)
  if (!isAuthed) {
    return null;
  }

  // If pending approval, show waiting page
  if (pendingApproval) {
    return <PendingApprovalPage />;
  }

  // If must change password, show modal
  if (mustChangePassword) {
    return (
      <>
        {children}
        <ChangePasswordModal isOpen={true} />
      </>
    );
  }

  return <>{children}</>;
}
