import { create } from 'zustand';

const SIDEBAR_OPEN_KEY = 'nonotion_sidebar_open';

function loadSidebarOpen(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

// Seed the peek panel (split view) from the `?peek=` URL param so a fresh load / shared link
// opens the split view immediately, and so the store and URL agree from the first render
// (MainLayout keeps them in sync thereafter). See CLAUDE.md "split view" notes.
function loadInitialPeek(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('peek');
  } catch {
    return null;
  }
}

interface UiState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  searchOpen: boolean;
  peekPageId: string | null;
  peekPanelWidth: number;
  sidebarAutoCollapsed: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSearchOpen: (open: boolean) => void;
  toggleSearch: () => void;
  openPeekPanel: (pageId: string) => void;
  closePeekPanel: () => void;
  setPeekPanelWidth: (width: number) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: loadSidebarOpen(),
  sidebarWidth: 240,
  searchOpen: false,
  peekPageId: loadInitialPeek(),
  peekPanelWidth: 0,
  sidebarAutoCollapsed: false,

  toggleSidebar: () => {
    set((state) => {
      const next = !state.sidebarOpen;
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(next));
      return { sidebarOpen: next };
    });
  },

  setSidebarOpen: (open) => {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(open));
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

  openPeekPanel: (pageId) => set({ peekPageId: pageId }),

  closePeekPanel: () => {
    const { sidebarAutoCollapsed } = get();
    set({ peekPageId: null });
    if (sidebarAutoCollapsed) {
      localStorage.setItem(SIDEBAR_OPEN_KEY, 'true');
      set({ sidebarOpen: true, sidebarAutoCollapsed: false });
    }
  },

  setPeekPanelWidth: (width) => {
    const min = 480;
    const max = window.innerWidth - 400;
    set({ peekPanelWidth: Math.max(min, Math.min(max, width)) });
  },
}));
