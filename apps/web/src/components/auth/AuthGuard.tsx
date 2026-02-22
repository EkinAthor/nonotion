import { useEffect, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { IS_DEMO_MODE } from '@/api/client';
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
  const { isAuthenticated, mustChangePassword, pendingApproval, fetchCurrentUser, isLoading } = useAuthStore();

  useEffect(() => {
    // Verify token is still valid on mount
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated()) {
      // Redirect to login, but save the intended destination
      navigate('/login', { state: { from: location.pathname }, replace: true });
    }
  }, [isLoading, isAuthenticated, navigate, location.pathname]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-notion-bg">
        <div className="text-notion-text-secondary">Loading...</div>
      </div>
    );
  }

  // If not authenticated, return null (will redirect)
  if (!isAuthenticated()) {
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
