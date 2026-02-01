import type { PublicUser } from '@nonotion/shared';
import { userStorage } from '../storage/sqlite-storage.js';
import { toPublicUser } from './auth-service.js';

export async function getAllUsers(): Promise<PublicUser[]> {
  const users = await userStorage.getAllUsers();
  return users.map(toPublicUser);
}

export async function getPublicUser(id: string): Promise<PublicUser | null> {
  const user = await userStorage.getUser(id);
  return user ? toPublicUser(user) : null;
}

export async function searchUsersByEmail(query: string): Promise<PublicUser[]> {
  const users = await userStorage.getAllUsers();
  const lowerQuery = query.toLowerCase();
  return users
    .filter((u) => u.email.toLowerCase().includes(lowerQuery))
    .map(toPublicUser);
}

export async function updateUserRole(userId: string, role: 'admin' | 'user'): Promise<PublicUser> {
  const updated = await userStorage.updateUser(userId, { role });
  if (!updated) {
    throw new Error('User not found');
  }
  return toPublicUser(updated);
}
