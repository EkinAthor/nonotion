import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  searchOpen: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSearchOpen: (open: boolean) => void;
  toggleSearch: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  sidebarWidth: 240,
  searchOpen: false,

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
  },

  setSidebarWidth: (width) => {
    set({ sidebarWidth: Math.max(200, Math.min(480, width)) });
  },

  setSearchOpen: (open) => {
    set({ searchOpen: open });
  },

  toggleSearch: () => {
    set((state) => ({ searchOpen: !state.searchOpen }));
  },
}));
