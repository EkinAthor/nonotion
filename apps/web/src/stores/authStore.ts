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

  // Actions
  login: (email: string, password: string) => Promise<void>;
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

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login({ email, password });
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
        set({
          user: null,
          token: null,
          mustChangePassword: false,
          pendingApproval: false,
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
