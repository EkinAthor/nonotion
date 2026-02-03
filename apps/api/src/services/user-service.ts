import type { PublicUser } from '@nonotion/shared';
import { getUserStorage } from '../storage/storage-factory.js';
import { toPublicUser } from './auth-service.js';
import * as pageService from './page-service.js';

export async function getAllUsers(): Promise<PublicUser[]> {
  const users = await getUserStorage().getAllUsers();
  return users.map(toPublicUser);
}

export async function getPublicUser(id: string): Promise<PublicUser | null> {
  const user = await getUserStorage().getUser(id);
  return user ? toPublicUser(user) : null;
}

export async function searchUsersByEmail(query: string): Promise<PublicUser[]> {
  const users = await getUserStorage().getAllUsers();
  const lowerQuery = query.toLowerCase();
  return users
    .filter((u) => u.email.toLowerCase().includes(lowerQuery))
    .map(toPublicUser);
}

export async function updateUserRole(userId: string, role: 'admin' | 'user'): Promise<PublicUser> {
  const updated = await getUserStorage().updateUser(userId, { role });
  if (!updated) {
    throw new Error('User not found');
  }
  return toPublicUser(updated);
}

export async function updateUserApproval(userId: string, approved: boolean): Promise<PublicUser> {
  const updated = await getUserStorage().updateUser(userId, { approved });
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
  const userToDelete = await getUserStorage().getUser(userIdToDelete);
  if (!userToDelete) {
    throw new Error('User not found');
  }

  // Prevent self-deletion
  if (userIdToDelete === requestingAdminId) {
    throw new Error('Cannot delete your own account');
  }

  // Prevent deleting last admin
  if (userToDelete.role === 'admin') {
    const allUsers = await getUserStorage().getAllUsers();
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
  await getUserStorage().transferOwnerPermissions(userIdToDelete, requestingAdminId);

  // Delete user
  await getUserStorage().deleteUser(userIdToDelete);
}
