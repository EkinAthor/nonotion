import { useState, FormEvent } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { IS_DEMO_MODE } from '@/api/client';
import ChangePasswordModal from './ChangePasswordModal';
import McpSettingsSection from './McpSettingsSection';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type View = 'main' | 'enable-confirm' | 'disable-confirm';

export default function AccountSettingsModal({ isOpen, onClose }: AccountSettingsModalProps) {
  const { user, authConfig, initiateTwoFactor, confirmTwoFactor, disableTwoFactor, clearError } = useAuthStore();
  const [view, setView] = useState<View>('main');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  if (!isOpen) return null;

  const hasPassword = user?.hasPassword ?? false;
  const twoFactorEnabled = user?.twoFactorEnabled ?? false;
  // 2FA is only for password accounts and unavailable in demo mode
  const canUseTwoFactor = hasPassword && !IS_DEMO_MODE;

  const resetSubViews = () => {
    setView('main');
    setCode('');
    setPassword('');
    setLocalError(null);
    setNotice(null);
  };

  const handleClose = () => {
    resetSubViews();
    clearError();
    onClose();
  };

  const handleStartEnable = async () => {
    setLocalError(null);
    setNotice(null);
    setBusy(true);
    try {
      await initiateTwoFactor();
      setView('enable-confirm');
      setNotice('We emailed a 6-digit code to your account address.');
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEnable = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      await confirmTwoFactor(code);
      resetSubViews();
      setNotice('Two-factor authentication is now enabled.');
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDisable = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      await disableTwoFactor(password);
      resetSubViews();
      setNotice('Two-factor authentication has been disabled.');
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-xl">
        <div className="px-6 py-4 border-b border-notion-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-notion-text">Account settings</h2>
          <button
            onClick={handleClose}
            className="text-notion-text-secondary hover:text-notion-text text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {notice && (
            <div className="p-3 text-sm text-green-700 bg-green-50 rounded-md border border-green-200">
              {notice}
            </div>
          )}
          {localError && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
              {localError}
            </div>
          )}

          {/* Two-factor authentication */}
          {canUseTwoFactor && (
            <section>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-notion-text">Email two-factor authentication</h3>
                  <p className="text-sm text-notion-text-secondary mt-1">
                    {twoFactorEnabled
                      ? 'Enabled — a code is emailed to you at each sign-in.'
                      : 'Require an emailed code in addition to your password when signing in.'}
                  </p>
                </div>
                {view === 'main' && (
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      twoFactorEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {twoFactorEnabled ? 'On' : 'Off'}
                  </span>
                )}
              </div>

              {view === 'main' && (
                <div className="mt-3">
                  {twoFactorEnabled ? (
                    <button
                      onClick={() => {
                        setLocalError(null);
                        setNotice(null);
                        setView('disable-confirm');
                      }}
                      className="text-sm px-3 py-1.5 border border-red-300 rounded-md text-red-600 hover:bg-red-50"
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      onClick={handleStartEnable}
                      disabled={busy}
                      className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy ? 'Sending code…' : 'Enable'}
                    </button>
                  )}
                </div>
              )}

              {view === 'enable-confirm' && (
                <form onSubmit={handleConfirmEnable} className="mt-3 space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                    placeholder="000000"
                    className="w-full px-3 py-2 border border-notion-border rounded-md bg-white text-notion-text text-center text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={resetSubViews} className="px-3 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded-md">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy || code.length !== 6}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy ? 'Verifying…' : 'Confirm'}
                    </button>
                  </div>
                </form>
              )}

              {view === 'disable-confirm' && (
                <form onSubmit={handleConfirmDisable} className="mt-3 space-y-3">
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    placeholder="Enter your current password"
                    className="w-full px-3 py-2 border border-notion-border rounded-md bg-white text-notion-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={resetSubViews} className="px-3 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded-md">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy || password.length === 0}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                    >
                      {busy ? 'Disabling…' : 'Disable 2FA'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

          {/* Password */}
          {hasPassword && !IS_DEMO_MODE && (
            <section className="border-t border-notion-border pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-notion-text">Password</h3>
                  <p className="text-sm text-notion-text-secondary mt-1">Change your account password.</p>
                </div>
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="shrink-0 text-sm px-3 py-1.5 border border-notion-border rounded-md text-notion-text hover:bg-notion-hover"
                >
                  Change password
                </button>
              </div>
            </section>
          )}

          {!canUseTwoFactor && !hasPassword && (
            <p className="text-sm text-notion-text-secondary">
              This account signs in with Google. Two-factor authentication is managed by your Google account.
            </p>
          )}

          {/* Claude / MCP access */}
          {authConfig?.mcpEnabled && !IS_DEMO_MODE && <McpSettingsSection />}
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal isOpen={true} onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
