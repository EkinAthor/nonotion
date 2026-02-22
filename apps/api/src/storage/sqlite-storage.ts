import { db } from '../db/index.js';
import { users, permissions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { User, PagePermission, UserRole } from '@nonotion/shared';
import type { UserStorageAdapter } from './storage-adapter.js';

function rowToUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    avatarUrl: row.avatarUrl,
    googleId: row.googleId ?? null,
    role: row.role as UserRole,
    mustChangePassword: row.mustChangePassword,
    approved: row.approved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToPermission(row: typeof permissions.$inferSelect): PagePermission {
  return {
    pageId: row.pageId,
    userId: row.userId,
    level: row.level as PagePermission['level'],
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
  };
}

class SqliteStorage implements UserStorageAdapter {
  // Users
  async getAllUsers(): Promise<User[]> {
    const rows = db.select().from(users).all();
    return rows.map(rowToUser);
  }

  async getUser(id: string): Promise<User | null> {
    const rows = db.select().from(users).where(eq(users.id, id)).all();
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const rows = db.select().from(users).where(eq(users.email, email.toLowerCase())).all();
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const rows = db.select().from(users).where(eq(users.googleId, googleId)).all();
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async createUser(user: User): Promise<User> {
    db.insert(users).values({
      id: user.id,
      email: user.email.toLowerCase(),
      name: user.name,
      passwordHash: user.passwordHash,
      avatarUrl: user.avatarUrl,
      googleId: user.googleId,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      approved: user.approved,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }).run();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const existing = await this.getUser(id);
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (updates.email !== undefined) updateData.email = updates.email.toLowerCase();
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.passwordHash !== undefined) updateData.passwordHash = updates.passwordHash;
    if (updates.avatarUrl !== undefined) updateData.avatarUrl = updates.avatarUrl;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.mustChangePassword !== undefined) updateData.mustChangePassword = updates.mustChangePassword;
    if (updates.approved !== undefined) updateData.approved = updates.approved;
    if (updates.googleId !== undefined) updateData.googleId = updates.googleId;
    if (updates.updatedAt !== undefined) updateData.updatedAt = updates.updatedAt;

    if (Object.keys(updateData).length > 0) {
      db.update(users).set(updateData).where(eq(users.id, id)).run();
    }

    return this.getUser(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = db.delete(users).where(eq(users.id, id)).run();
    return result.changes > 0;
  }

  async countUsers(): Promise<number> {
    const result = db.select().from(users).all();
    return result.length;
  }

  // Permissions
  async getPagePermissions(pageId: string): Promise<PagePermission[]> {
    const rows = db.select().from(permissions).where(eq(permissions.pageId, pageId)).all();
    return rows.map(rowToPermission);
  }

  async getUserPermissions(userId: string): Promise<PagePermission[]> {
    const rows = db.select().from(permissions).where(eq(permissions.userId, userId)).all();
    return rows.map(rowToPermission);
  }

  async getPermission(pageId: string, userId: string): Promise<PagePermission | null> {
    const rows = db.select().from(permissions)
      .where(and(eq(permissions.pageId, pageId), eq(permissions.userId, userId)))
      .all();
    return rows.length > 0 ? rowToPermission(rows[0]) : null;
  }

  async createPermission(permission: PagePermission): Promise<PagePermission> {
    db.insert(permissions).values({
      pageId: permission.pageId,
      userId: permission.userId,
      level: permission.level,
      grantedBy: permission.grantedBy,
      grantedAt: permission.grantedAt,
    }).run();
    return permission;
  }

  async updatePermission(
    pageId: string,
    userId: string,
    updates: Partial<PagePermission>
  ): Promise<PagePermission | null> {
    const existing = await this.getPermission(pageId, userId);
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (updates.level !== undefined) updateData.level = updates.level;
    if (updates.grantedBy !== undefined) updateData.grantedBy = updates.grantedBy;
    if (updates.grantedAt !== undefined) updateData.grantedAt = updates.grantedAt;

    if (Object.keys(updateData).length > 0) {
      db.update(permissions)
        .set(updateData)
        .where(and(eq(permissions.pageId, pageId), eq(permissions.userId, userId)))
        .run();
    }

    return this.getPermission(pageId, userId);
  }

  async deletePermission(pageId: string, userId: string): Promise<boolean> {
    const result = db.delete(permissions)
      .where(and(eq(permissions.pageId, pageId), eq(permissions.userId, userId)))
      .run();
    return result.changes > 0;
  }

  async deletePagePermissions(pageId: string): Promise<void> {
    db.delete(permissions).where(eq(permissions.pageId, pageId)).run();
  }

  async transferOwnerPermissions(fromUserId: string, toUserId: string): Promise<void> {
    // Update all owner permissions from the deleted user to the new owner
    db.update(permissions)
      .set({ userId: toUserId })
      .where(and(eq(permissions.userId, fromUserId), eq(permissions.level, 'owner')))
      .run();

    // Delete any non-owner permissions for the deleted user
    db.delete(permissions).where(eq(permissions.userId, fromUserId)).run();
  }

  async deleteUserPermissions(userId: string): Promise<void> {
    db.delete(permissions).where(eq(permissions.userId, userId)).run();
  }
}

export const userStorage = new SqliteStorage();
