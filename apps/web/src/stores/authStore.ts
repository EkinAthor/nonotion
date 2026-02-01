import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicUser } from '@nonotion/shared';
import { authApi } from '@/api/client';

interface AuthState {
  user: PublicUser | null;
  token: string | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  fetchCurrentUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;

  // Selectors
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      mustChangePassword: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login({ email, password });
          set({
            user: response.user,
            token: response.token,
            mustChangePassword: response.mustChangePassword,
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

      logout: () => {
        set({
          user: null,
          token: null,
          mustChangePassword: false,
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
            isLoading: false,
          });
        } catch (error) {
          // If fetch fails, clear auth state
          set({
            user: null,
            token: null,
            mustChangePassword: false,
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
    }),
    {
      name: 'nonotion-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        mustChangePassword: state.mustChangePassword,
      }),
    }
  )
);
