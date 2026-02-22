import { db } from '../db/index.js';
import { users, permissions, pages, blocks, files } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
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
import type { FileStorageAdapter, StoredFile } from './file-storage-adapter.js';
import type { PageRow, BlockRow } from '../db/schema.js';

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

function rowToPage(row: PageRow): Page {
  const page: Page = {
    id: row.id,
    title: row.title,
    type: row.type as PageType,
    ownerId: row.ownerId,
    parentId: row.parentId,
    childIds: JSON.parse(row.childIds) as string[],
    icon: row.icon,
    isStarred: row.isStarred,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
  if (row.databaseSchema) {
    page.databaseSchema = JSON.parse(row.databaseSchema) as DatabaseSchema;
  }
  if (row.properties) {
    page.properties = JSON.parse(row.properties) as Record<string, PropertyValue>;
  }
  return page;
}

function rowToBlock(row: BlockRow): Block {
  return {
    id: row.id,
    type: row.type as Block['type'],
    pageId: row.pageId,
    order: row.order,
    content: JSON.parse(row.content) as BlockContent,
    version: row.version,
  };
}

export class SqliteFullStorage implements StorageAdapter, UserStorageAdapter, FileStorageAdapter {
  // ==================== StorageAdapter: Pages ====================

  async getAllPages(): Promise<Page[]> {
    const rows = db.select().from(pages).all();
    return rows.map(rowToPage);
  }

  async getPage(id: string): Promise<Page | null> {
    const rows = db.select().from(pages).where(eq(pages.id, id)).all();
    return rows.length > 0 ? rowToPage(rows[0]) : null;
  }

  async createPage(page: Page): Promise<Page> {
    db.insert(pages).values({
      id: page.id,
      title: page.title,
      type: page.type,
      ownerId: page.ownerId,
      parentId: page.parentId,
      childIds: JSON.stringify(page.childIds),
      icon: page.icon,
      isStarred: page.isStarred,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      version: page.version,
      databaseSchema: page.databaseSchema ? JSON.stringify(page.databaseSchema) : null,
      properties: page.properties ? JSON.stringify(page.properties) : null,
    }).run();
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
    if (updates.childIds !== undefined) updateData.childIds = JSON.stringify(updates.childIds);
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.isStarred !== undefined) updateData.isStarred = updates.isStarred;
    if (updates.updatedAt !== undefined) updateData.updatedAt = updates.updatedAt;
    if (updates.version !== undefined) updateData.version = updates.version;
    if (updates.databaseSchema !== undefined)
      updateData.databaseSchema = updates.databaseSchema ? JSON.stringify(updates.databaseSchema) : null;
    if (updates.properties !== undefined)
      updateData.properties = updates.properties ? JSON.stringify(updates.properties) : null;

    if (Object.keys(updateData).length > 0) {
      db.update(pages).set(updateData).where(eq(pages.id, id)).run();
    }

    return this.getPage(id);
  }

  async deletePage(id: string): Promise<boolean> {
    const result = db.delete(pages).where(eq(pages.id, id)).run();
    return result.changes > 0;
  }

  // ==================== StorageAdapter: Blocks ====================

  async getBlocksByPage(pageId: string): Promise<Block[]> {
    const rows = db
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, pageId))
      .orderBy(blocks.order)
      .all();
    return rows.map(rowToBlock);
  }

  async getBlock(id: string): Promise<Block | null> {
    const rows = db.select().from(blocks).where(eq(blocks.id, id)).all();
    return rows.length > 0 ? rowToBlock(rows[0]) : null;
  }

  async createBlock(block: Block): Promise<Block> {
    db.insert(blocks).values({
      id: block.id,
      type: block.type,
      pageId: block.pageId,
      order: block.order,
      content: JSON.stringify(block.content),
      version: block.version,
    }).run();
    return block;
  }

  async updateBlock(id: string, updates: Partial<Block>): Promise<Block | null> {
    const existing = await this.getBlock(id);
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.pageId !== undefined) updateData.pageId = updates.pageId;
    if (updates.order !== undefined) updateData.order = updates.order;
    if (updates.content !== undefined) updateData.content = JSON.stringify(updates.content);
    if (updates.version !== undefined) updateData.version = updates.version;

    if (Object.keys(updateData).length > 0) {
      db.update(blocks).set(updateData).where(eq(blocks.id, id)).run();
    }

    return this.getBlock(id);
  }

  async deleteBlock(id: string): Promise<boolean> {
    const result = db.delete(blocks).where(eq(blocks.id, id)).run();
    return result.changes > 0;
  }

  async deleteBlocksByPage(pageId: string): Promise<void> {
    db.delete(blocks).where(eq(blocks.pageId, pageId)).run();
  }

  async getBlocksByPages(pageIds: string[]): Promise<Block[]> {
    if (pageIds.length === 0) return [];
    const rows = db.select().from(blocks).where(inArray(blocks.pageId, pageIds)).all();
    return rows.map(rowToBlock);
  }

  // ==================== UserStorageAdapter: Users ====================

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

  // ==================== UserStorageAdapter: Permissions ====================

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
    db.update(permissions)
      .set({ userId: toUserId })
      .where(and(eq(permissions.userId, fromUserId), eq(permissions.level, 'owner')))
      .run();

    db.delete(permissions).where(eq(permissions.userId, fromUserId)).run();
  }

  async deleteUserPermissions(userId: string): Promise<void> {
    db.delete(permissions).where(eq(permissions.userId, userId)).run();
  }

  // ==================== FileStorageAdapter ====================

  async saveFile(file: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    data: Buffer;
    uploadedBy: string;
  }): Promise<StoredFile> {
    const createdAt = new Date().toISOString();
    db.insert(files).values({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      data: file.data,
      uploadedBy: file.uploadedBy,
      createdAt,
    }).run();
    return {
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      uploadedBy: file.uploadedBy,
      createdAt,
    };
  }

  async getFileMeta(id: string): Promise<StoredFile | null> {
    const rows = db.select({
      id: files.id,
      filename: files.filename,
      mimeType: files.mimeType,
      size: files.size,
      uploadedBy: files.uploadedBy,
      createdAt: files.createdAt,
    }).from(files).where(eq(files.id, id)).all();
    return rows.length > 0 ? rows[0] : null;
  }

  async getFileData(id: string): Promise<Buffer | null> {
    const rows = db.select({ data: files.data }).from(files).where(eq(files.id, id)).all();
    return rows.length > 0 ? rows[0].data : null;
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = db.delete(files).where(eq(files.id, id)).run();
    return result.changes > 0;
  }
}
