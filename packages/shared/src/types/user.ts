export interface User {
  id: string; // "usr_xxxxx"
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
}

// For Phase 1, we have a single admin user auto-logged in
export const ADMIN_USER: User = {
  id: 'usr_admin',
  name: 'Admin',
  email: 'admin@nonotion.local',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};
