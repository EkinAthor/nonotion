/**
 * One-time initialization for demo mode.
 * Called synchronously before React renders.
 */
import { isDemoSeeded } from './demo-storage';
import { seedDemoData, DEMO_USER } from './demo-data';

export function initDemoMode(): void {
  // 1. Seed demo content if not already seeded
  if (!isDemoSeeded()) {
    seedDemoData();
  }

  // 2. Always ensure auth store has demo user + token in localStorage
  // so Zustand persist picks it up on hydration
  const authData = {
    state: {
      token: 'demo-token',
      user: { ...DEMO_USER },
      mustChangePassword: false,
      pendingApproval: false,
      authConfig: { enabledModes: ['db'] },
    },
    version: 0,
  };
  localStorage.setItem('nonotion-auth', JSON.stringify(authData));
}
