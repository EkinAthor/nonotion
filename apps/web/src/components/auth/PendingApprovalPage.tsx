import { useAuthStore } from '@/stores/authStore';

export default function PendingApprovalPage() {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-notion-bg">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-yellow-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-notion-text mb-2">
          Waiting for Approval
        </h1>

        <p className="text-notion-text-secondary mb-6">
          Your account is pending administrator approval. You'll be able to access
          the application once an admin approves your account.
        </p>

        {user?.email && (
          <p className="text-sm text-notion-text-secondary mb-6">
            Signed in as <span className="font-medium text-notion-text">{user.email}</span>
          </p>
        )}

        <button
          onClick={logout}
          className="px-4 py-2 text-sm bg-notion-hover hover:bg-gray-200 text-notion-text rounded transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
