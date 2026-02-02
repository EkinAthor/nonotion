import type { PublicUser } from '@nonotion/shared';
import { userStorage } from '../storage/sqlite-storage.js';
import { toPublicUser } from './auth-service.js';
import * as pageService from './page-service.js';

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

export async function updateUserApproval(userId: string, approved: boolean): Promise<PublicUser> {
  const updated = await userStorage.updateUser(userId, { approved });
  if (!updated) {
    throw new Error('User not found');
  }
  return toPublicUser(updated);
}

export async function deleteUser(
  userIdToDelete: string,
  requestingAdminId: string
): Promise<void> {
  // Validate user exists
  const userToDelete = await userStorage.getUser(userIdToDelete);
  if (!userToDelete) {
    throw new Error('User not found');
  }

  // Prevent self-deletion
  if (userIdToDelete === requestingAdminId) {
    throw new Error('Cannot delete your own account');
  }

  // Prevent deleting last admin
  if (userToDelete.role === 'admin') {
    const allUsers = await userStorage.getAllUsers();
    const adminCount = allUsers.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      throw new Error('Cannot delete the last admin user');
    }
  }

  // Transfer all owned pages to requesting admin
  const ownedPages = await pageService.getPagesByOwner(userIdToDelete);
  for (const page of ownedPages) {
    await pageService.transferPageOwnership(page.id, requestingAdminId);
  }

  // Update permission records: transfer owner permissions to admin
  await userStorage.transferOwnerPermissions(userIdToDelete, requestingAdminId);

  // Delete user
  await userStorage.deleteUser(userIdToDelete);
}
