import { create } from 'zustand';
import type { PresenceUser } from '@nonotion/shared';

interface PresenceState {
  /** Users currently present on the active page. */
  pageUsers: PresenceUser[];

  /** Map of blockId → user who is actively editing that block. */
  activeBlockEditors: Map<string, PresenceUser>;

  /** Whether realtime is connected and active. */
  connected: boolean;

  // Actions (called by RealtimeManager, not by components)
  setPageUsers: (users: PresenceUser[]) => void;
  setConnected: (connected: boolean) => void;
  clearPresence: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  pageUsers: [],
  activeBlockEditors: new Map(),
  connected: false,

  setPageUsers: (users) => {
    // Derive activeBlockEditors from presence data
    const editors = new Map<string, PresenceUser>();
    for (const user of users) {
      if (user.activeBlockId) {
        editors.set(user.activeBlockId, user);
      }
    }
    set({ pageUsers: users, activeBlockEditors: editors });
  },

  setConnected: (connected) => set({ connected }),

  clearPresence: () => set({
    pageUsers: [],
    activeBlockEditors: new Map(),
  }),
}));
