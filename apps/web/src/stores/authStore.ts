import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicUser, AuthConfigResponse } from '@nonotion/shared';
import { authApi } from '@/api/client';

interface AuthState {
  user: PublicUser | null;
  token: string | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  pendingApproval: boolean;
  error: string | null;
  authConfig: AuthConfigResponse | null;
  authConfigLoading: boolean;
  // Email 2FA login challenge (transient — not persisted)
  twoFactorPending: boolean;
  pendingToken: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  verifyTwoFactor: (code: string) => Promise<void>;
  cancelTwoFactor: () => void;
  initiateTwoFactor: () => Promise<void>;
  confirmTwoFactor: (code: string) => Promise<void>;
  disableTwoFactor: (password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  fetchAuthConfig: () => Promise<void>;
  logout: () => void;
  fetchCurrentUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;

  // Selectors
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  isOwner: () => boolean;
  isPendingApproval: () => boolean;
  isGoogleEnabled: () => boolean;
  isDbEnabled: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      mustChangePassword: false,
      pendingApproval: false,
      error: null,
      authConfig: null,
      authConfigLoading: false,
      twoFactorPending: false,
      pendingToken: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login({ email, password });
          // Email 2FA enabled — enter the code-entry challenge instead of session
          if ('twoFactorRequired' in response) {
            set({
              twoFactorPending: true,
              pendingToken: response.pendingToken,
              isLoading: false,
            });
            return;
          }
          set({
            user: response.user,
            token: response.token,
            mustChangePassword: response.mustChangePassword,
            pendingApproval: !response.user.approved,
            twoFactorPending: false,
            pendingToken: null,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
          });
          throw error;
        }
      },

      verifyTwoFactor: async (code) => {
        const pendingToken = get().pendingToken;
        if (!pendingToken) {
          throw new Error('No sign-in in progress');
        }
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.verifyTwoFactor({ pendingToken, code });
          set({
            user: response.user,
            token: response.token,
            mustChangePassword: response.mustChangePassword,
            pendingApproval: !response.user.approved,
            twoFactorPending: false,
            pendingToken: null,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
          });
          throw error;
        }
      },

      cancelTwoFactor: () => {
        set({ twoFactorPending: false, pendingToken: null, error: null });
      },

      initiateTwoFactor: async () => {
        set({ error: null });
        try {
          await authApi.initiateTwoFactor();
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },

      confirmTwoFactor: async (code) => {
        set({ error: null });
        try {
          const updated = await authApi.confirmTwoFactor({ code });
          set({ user: updated });
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },

      disableTwoFactor: async (password) => {
        set({ error: null });
        try {
          const updated = await authApi.disableTwoFactor({ password });
          set({ user: updated });
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },

      register: async (email, name, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register({ email, name, password });
          set({
            user: response.user,
            token: response.token,
            mustChangePassword: response.mustChangePassword,
            pendingApproval: !response.user.approved,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
          });
          throw error;
        }
      },

      googleLogin: async (credential) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.googleLogin({ credential });
          set({
            user: response.user,
            token: response.token,
            mustChangePassword: false,
            pendingApproval: !response.user.approved,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
          });
          throw error;
        }
      },

      fetchAuthConfig: async () => {
        set({ authConfigLoading: true });
        try {
          const config = await authApi.getConfig();
          set({ authConfig: config, authConfigLoading: false });
        } catch {
          // Fallback to db-only if config fetch fails
          set({
            authConfig: { enabledModes: ['db'], googleClientId: null },
            authConfigLoading: false,
          });
        }
      },

      logout: () => {
        // Disconnect realtime on logout (imported lazily to avoid circular deps)
        import('@/lib/realtime').then(({ getRealtimeManager }) => {
          getRealtimeManager()?.disconnect();
        });
        set({
          user: null,
          token: null,
          mustChangePassword: false,
          pendingApproval: false,
          twoFactorPending: false,
          pendingToken: null,
          error: null,
        });
      },

      fetchCurrentUser: async () => {
        const token = get().token;
        if (!token) return;

        set({ isLoading: true, error: null });
        try {
          const response = await authApi.me();
          set({
            user: response,
            mustChangePassword: response.mustChangePassword,
            pendingApproval: !response.approved,
            isLoading: false,
          });
        } catch (error) {
          // If fetch fails, clear auth state
          set({
            user: null,
            token: null,
            mustChangePassword: false,
            pendingApproval: false,
            error: (error as Error).message,
            isLoading: false,
          });
        }
      },

      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true, error: null });
        try {
          await authApi.changePassword({ currentPassword, newPassword });
          set({ mustChangePassword: false, isLoading: false });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
          });
          throw error;
        }
      },

      clearError: () => set({ error: null }),

      isAuthenticated: () => !!get().token && !!get().user,

      isAdmin: () => get().user?.role === 'admin',

      isOwner: () => get().user?.isOwner === true,

      isPendingApproval: () => get().pendingApproval,

      isGoogleEnabled: () => get().authConfig?.enabledModes.includes('google') ?? false,

      isDbEnabled: () => get().authConfig?.enabledModes.includes('db') ?? true,
    }),
    {
      name: 'nonotion-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        mustChangePassword: state.mustChangePassword,
        pendingApproval: state.pendingApproval,
        authConfig: state.authConfig,
      }),
    }
  )
);
