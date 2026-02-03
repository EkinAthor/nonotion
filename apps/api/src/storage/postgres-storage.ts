import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import type {
  Page,
  Block,
  User,
  PagePermission,
  UserRole,
  BlockContent,
  DatabaseSchema,
  PropertyValue,
  PageType,
} from '@nonotion/shared';
import type { StorageAdapter, UserStorageAdapter } from './storage-adapter.js';
import * as pgSchema from '../db/pg-schema.js';

type PgDatabase = ReturnType<typeof drizzle<typeof pgSchema>>;

function rowToUser(row: pgSchema.UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    avatarUrl: row.avatarUrl,
    role: row.role as UserRole,
    mustChangePassword: row.mustChangePassword,
    approved: row.approved,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToPage(row: pgSchema.PageRow): Page {
  const page: Page = {
    id: row.id,
    title: row.title,
    type: row.type as PageType,
    ownerId: row.ownerId,
    parentId: row.parentId,
    childIds: row.childIds ?? [],
    icon: row.icon,
    isStarred: row.isStarred,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
  if (row.databaseSchema) {
    page.databaseSchema = row.databaseSchema as DatabaseSchema;
  }
  if (row.properties) {
    page.properties = row.properties as Record<string, PropertyValue>;
  }
  return page;
}

function rowToBlock(row: pgSchema.BlockRow): Block {
  return {
    id: row.id,
    type: row.type as Block['type'],
    pageId: row.pageId,
    order: row.order,
    content: row.content as BlockContent,
    version: row.version,
  };
}

function rowToPermission(row: pgSchema.PermissionRow): PagePermission {
  return {
    pageId: row.pageId,
    userId: row.userId,
    level: row.level as PagePermission['level'],
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt.toISOString(),
  };
}

export class PostgresStorage implements StorageAdapter, UserStorageAdapter {
  private db: PgDatabase;
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema: pgSchema });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ==================== StorageAdapter: Pages ====================

  async getAllPages(): Promise<Page[]> {
    const rows = await this.db.select().from(pgSchema.pages);
    return rows.map(rowToPage);
  }

  async getPage(id: string): Promise<Page | null> {
    const rows = await this.db.select().from(pgSchema.pages).where(eq(pgSchema.pages.id, id));
    return rows.length > 0 ? rowToPage(rows[0]) : null;
  }

  async createPage(page: Page): Promise<Page> {
    await this.db.insert(pgSchema.pages).values({
      id: page.id,
      title: page.title,
      type: page.type,
      ownerId: page.ownerId,
      parentId: page.parentId,
      childIds: page.childIds,
      icon: page.icon,
      isStarred: page.isStarred,
      createdAt: new Date(page.createdAt),
      updatedAt: new Date(page.updatedAt),
      version: page.version,
      databaseSchema: page.databaseSchema ?? null,
      properties: page.properties ?? null,
    });
    return page;
  }

  async updatePage(id: string, updates: Partial<Page>): Promise<Page | null> {
    const existing = await this.getPage(id);
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.ownerId !== undefined) updateData.ownerId = updates.ownerId;
    if (updates.parentId !== undefined) updateData.parentId = updates.parentId;
    if (updates.childIds !== undefined) updateData.childIds = updates.childIds;
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.isStarred !== undefined) updateData.isStarred = updates.isStarred;
    if (updates.updatedAt !== undefined) updateData.updatedAt = new Date(updates.updatedAt);
    if (updates.version !== undefined) updateData.version = updates.version;
    if (updates.databaseSchema !== undefined) updateData.databaseSchema = updates.databaseSchema;
    if (updates.properties !== undefined) updateData.properties = updates.properties;

    if (Object.keys(updateData).length > 0) {
      await this.db.update(pgSchema.pages).set(updateData).where(eq(pgSchema.pages.id, id));
    }

    return this.getPage(id);
  }

  async deletePage(id: string): Promise<boolean> {
    const result = await this.db.delete(pgSchema.pages).where(eq(pgSchema.pages.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ==================== StorageAdapter: Blocks ====================

  async getBlocksByPage(pageId: string): Promise<Block[]> {
    const rows = await this.db
      .select()
      .from(pgSchema.blocks)
      .where(eq(pgSchema.blocks.pageId, pageId))
      .orderBy(pgSchema.blocks.order);
    return rows.map(rowToBlock);
  }

  async getBlock(id: string): Promise<Block | null> {
    const rows = await this.db.select().from(pgSchema.blocks).where(eq(pgSchema.blocks.id, id));
    return rows.length > 0 ? rowToBlock(rows[0]) : null;
  }

  async createBlock(block: Block): Promise<Block> {
    await this.db.insert(pgSchema.blocks).values({
      id: block.id,
      type: block.type,
      pageId: block.pageId,
      order: block.order,
      content: block.content,
      version: block.version,
    });
    return block;
  }

  async updateBlock(id: string, updates: Partial<Block>): Promise<Block | null> {
    const existing = await this.getBlock(id);
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.pageId !== undefined) updateData.pageId = updates.pageId;
    if (updates.order !== undefined) updateData.order = updates.order;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.version !== undefined) updateData.version = updates.version;

    if (Object.keys(updateData).length > 0) {
      await this.db.update(pgSchema.blocks).set(updateData).where(eq(pgSchema.blocks.id, id));
    }

    return this.getBlock(id);
  }

  async deleteBlock(id: string): Promise<boolean> {
    const result = await this.db.delete(pgSchema.blocks).where(eq(pgSchema.blocks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteBlocksByPage(pageId: string): Promise<void> {
    await this.db.delete(pgSchema.blocks).where(eq(pgSchema.blocks.pageId, pageId));
  }

  // ==================== UserStorageAdapter: Users ====================

  async getAllUsers(): Promise<User[]> {
    const rows = await this.db.select().from(pgSchema.users);
    return rows.map(rowToUser);
  }

  async getUser(id: string): Promise<User | null> {
    const rows = await this.db.select().from(pgSchema.users).where(eq(pgSchema.users.id, id));
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(pgSchema.users)
      .where(eq(pgSchema.users.email, email.toLowerCase()));
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async createUser(user: User): Promise<User> {
    await this.db.insert(pgSchema.users).values({
      id: user.id,
      email: user.email.toLowerCase(),
      name: user.name,
      passwordHash: user.passwordHash,
      avatarUrl: user.avatarUrl,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      approved: user.approved,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    });
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
    if (updates.mustChangePassword !== undefined)
      updateData.mustChangePassword = updates.mustChangePassword;
    if (updates.approved !== undefined) updateData.approved = updates.approved;
    if (updates.updatedAt !== undefined) updateData.updatedAt = new Date(updates.updatedAt);

    if (Object.keys(updateData).length > 0) {
      await this.db.update(pgSchema.users).set(updateData).where(eq(pgSchema.users.id, id));
    }

    return this.getUser(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.db.delete(pgSchema.users).where(eq(pgSchema.users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async countUsers(): Promise<number> {
    const result = await this.db.select().from(pgSchema.users);
    return result.length;
  }

  // ==================== UserStorageAdapter: Permissions ====================

  async getPagePermissions(pageId: string): Promise<PagePermission[]> {
    const rows = await this.db
      .select()
      .from(pgSchema.permissions)
      .where(eq(pgSchema.permissions.pageId, pageId));
    return rows.map(rowToPermission);
  }

  async getUserPermissions(userId: string): Promise<PagePermission[]> {
    const rows = await this.db
      .select()
      .from(pgSchema.permissions)
      .where(eq(pgSchema.permissions.userId, userId));
    return rows.map(rowToPermission);
  }

  async getPermission(pageId: string, userId: string): Promise<PagePermission | null> {
    const rows = await this.db
      .select()
      .from(pgSchema.permissions)
      .where(
        and(eq(pgSchema.permissions.pageId, pageId), eq(pgSchema.permissions.userId, userId))
      );
    return rows.length > 0 ? rowToPermission(rows[0]) : null;
  }

  async createPermission(permission: PagePermission): Promise<PagePermission> {
    await this.db.insert(pgSchema.permissions).values({
      pageId: permission.pageId,
      userId: permission.userId,
      level: permission.level,
      grantedBy: permission.grantedBy,
      grantedAt: new Date(permission.grantedAt),
    });
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
    if (updates.grantedAt !== undefined) updateData.grantedAt = new Date(updates.grantedAt);

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(pgSchema.permissions)
        .set(updateData)
        .where(
          and(eq(pgSchema.permissions.pageId, pageId), eq(pgSchema.permissions.userId, userId))
        );
    }

    return this.getPermission(pageId, userId);
  }

  async deletePermission(pageId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(pgSchema.permissions)
      .where(
        and(eq(pgSchema.permissions.pageId, pageId), eq(pgSchema.permissions.userId, userId))
      );
    return (result.rowCount ?? 0) > 0;
  }

  async deletePagePermissions(pageId: string): Promise<void> {
    await this.db.delete(pgSchema.permissions).where(eq(pgSchema.permissions.pageId, pageId));
  }

  async transferOwnerPermissions(fromUserId: string, toUserId: string): Promise<void> {
    // Update all owner permissions from the deleted user to the new owner
    await this.db
      .update(pgSchema.permissions)
      .set({ userId: toUserId })
      .where(
        and(
          eq(pgSchema.permissions.userId, fromUserId),
          eq(pgSchema.permissions.level, 'owner')
        )
      );

    // Delete any non-owner permissions for the deleted user
    await this.db
      .delete(pgSchema.permissions)
      .where(eq(pgSchema.permissions.userId, fromUserId));
  }

  async deleteUserPermissions(userId: string): Promise<void> {
    await this.db.delete(pgSchema.permissions).where(eq(pgSchema.permissions.userId, userId));
  }
}
