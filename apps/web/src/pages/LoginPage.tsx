import { useState, FormEvent } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import GoogleLoginButton from '@/components/auth/GoogleLoginButton';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    login,
    verifyTwoFactor,
    cancelTwoFactor,
    twoFactorPending,
    isLoading,
    error,
    clearError,
    isGoogleEnabled,
    isDbEnabled,
  } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const from = (location.state as { from?: string })?.from || '/';
  const googleEnabled = isGoogleEnabled();
  const dbEnabled = isDbEnabled();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      await login(email, password);
      // If 2FA is required, the store flips twoFactorPending and we stay here to
      // show the code step; navigation only happens once a session is issued.
      if (!useAuthStore.getState().twoFactorPending) {
        navigate(from, { replace: true });
      }
    } catch {
      // Error is handled in store
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      await verifyTwoFactor(code);
      navigate(from, { replace: true });
    } catch {
      // Error is handled in store
    }
  };

  const handleBackToLogin = () => {
    clearError();
    setCode('');
    setPassword('');
    cancelTwoFactor();
  };

  const handleGoogleSuccess = () => {
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-notion-bg">
      <div className="w-full max-w-md px-8 py-10">
        {twoFactorPending ? (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-notion-text">Enter your code</h1>
              <p className="text-notion-text-secondary mt-2">
                We emailed a 6-digit verification code to your account. Enter it below to finish signing in.
              </p>
            </div>

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-notion-text mb-1">
                  Verification code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-notion-border rounded-md bg-white text-notion-text text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="000000"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-notion-text-secondary">
              <button type="button" onClick={handleBackToLogin} className="text-blue-600 hover:underline">
                Back to sign in
              </button>
            </p>
          </>
        ) : (
        <>
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-notion-text">Welcome back</h1>
          <p className="text-notion-text-secondary mt-2">Sign in to your Nonotion account</p>
        </div>

        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200 mb-4">
            {error}
          </div>
        )}

        {googleEnabled && (
          <div className="mb-4">
            <GoogleLoginButton onSuccess={handleGoogleSuccess} />
          </div>
        )}

        {googleEnabled && dbEnabled && (
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-notion-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-notion-bg text-notion-text-secondary">or</span>
            </div>
          </div>
        )}

        {dbEnabled && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-notion-text mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2 border border-notion-border rounded-md bg-white text-notion-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-notion-text mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 border border-notion-border rounded-md bg-white text-notion-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-notion-text-secondary">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 hover:underline">
                Create one
              </Link>
            </p>
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
