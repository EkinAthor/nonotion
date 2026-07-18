import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type {
  Page,
  Block,
  User,
  PagePermission,
  PermissionLevel,
  UserRole,
  BlockContent,
  DatabaseSchema,
  PropertyValue,
  PageType,
} from '@nonotion/shared';
import type { StorageAdapter, UserStorageAdapter, DatabaseRowsQuery } from './storage-adapter.js';
import type { FileStorageAdapter, StoredFile } from './file-storage-adapter.js';
import * as pgSchema from '../db/pg-schema.js';

type PgDatabase = ReturnType<typeof drizzle<typeof pgSchema>>;

function rowToUser(row: pgSchema.UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    avatarUrl: row.avatarUrl,
    googleId: row.googleId ?? null,
    role: row.role as UserRole,
    isOwner: row.isOwner,
    mustChangePassword: row.mustChangePassword,
    approved: row.approved,
    twoFactorEnabled: row.twoFactorEnabled,
    twoFactorCodeHash: row.twoFactorCodeHash ?? null,
    twoFactorCodeExpiresAt: row.twoFactorCodeExpiresAt ?? null,
    twoFactorCodeAttempts: row.twoFactorCodeAttempts,
    twoFactorCodePurpose: (row.twoFactorCodePurpose as User['twoFactorCodePurpose']) ?? null,
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

// Maps a raw `SELECT p.*` pg result row (snake_case columns) to a Page.
function rawToPage(row: Record<string, unknown>): Page {
  const page: Page = {
    id: row.id as string,
    title: row.title as string,
    type: row.type as PageType,
    ownerId: row.owner_id as string,
    parentId: (row.parent_id as string | null) ?? null,
    childIds: (row.child_ids as string[] | null) ?? [],
    icon: (row.icon as string | null) ?? null,
    isStarred: row.is_starred as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    version: row.version as number,
  };
  if (row.database_schema) {
    page.databaseSchema = row.database_schema as DatabaseSchema;
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

export class PostgresStorage implements StorageAdapter, UserStorageAdapter, FileStorageAdapter {
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

  async getPagesByParent(parentId: string): Promise<Page[]> {
    const rows = await this.db
      .select()
      .from(pgSchema.pages)
      .where(eq(pgSchema.pages.parentId, parentId));
    return rows.map(rowToPage);
  }

  async getPagesByIds(ids: string[]): Promise<Page[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(pgSchema.pages).where(inArray(pgSchema.pages.id, ids));
    return rows.map(rowToPage);
  }

  async queryDatabaseRows(query: DatabaseRowsQuery): Promise<{ pages: Page[]; total: number }> {
    const { databaseId, titleContains, childIdsOrder, limit, offset } = query;

    // Escape LIKE metacharacters — the JS filter treats them literally.
    const pattern =
      titleContains !== null ? `%${titleContains.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

    // childIds ordering via a hash join (O(rows + ids)) — array_position()
    // would rescan the whole array per row.
    const result = await this.pool.query(
      `SELECT p.*, count(*) over() AS __total
       FROM pages p
       LEFT JOIN unnest($1::text[]) WITH ORDINALITY AS o(id, pos) ON o.id = p.id
       WHERE p.parent_id = $2${pattern !== null ? ' AND p.title ILIKE $5' : ''}
       ORDER BY o.pos NULLS LAST, p.id
       LIMIT $3 OFFSET $4`,
      pattern !== null
        ? [childIdsOrder, databaseId, limit, offset, pattern]
        : [childIdsOrder, databaseId, limit, offset]
    );

    if (result.rows.length > 0) {
      const total = Number(result.rows[0].__total);
      return { pages: result.rows.map(rawToPage), total };
    }
    // Empty page of results at offset > 0 — count separately.
    if (offset > 0) {
      const counted = await this.pool.query(
        `SELECT count(*) AS total FROM pages p
         WHERE p.parent_id = $1${pattern !== null ? ' AND p.title ILIKE $2' : ''}`,
        pattern !== null ? [databaseId, pattern] : [databaseId]
      );
      return { pages: [], total: Number(counted.rows[0]?.total ?? 0) };
    }
    return { pages: [], total: 0 };
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

  async getBlocksByPages(pageIds: string[]): Promise<Block[]> {
    if (pageIds.length === 0) return [];
    const rows = await this.db.select().from(pgSchema.blocks).where(inArray(pgSchema.blocks.pageId, pageIds));
    return rows.map(rowToBlock);
  }

  async updateBlockOrders(pageId: string, orders: Array<{ id: string; order: number }>): Promise<void> {
    if (orders.length === 0) return;
    const ids = orders.map((o) => o.id);
    const ords = orders.map((o) => o.order);
    await this.db.execute(sql`
      UPDATE blocks b
      SET "order" = v.ord, version = b.version + 1
      FROM unnest(${sql.param(ids)}::text[], ${sql.param(ords)}::int[]) AS v(id, ord)
      WHERE b.id = v.id AND b.page_id = ${pageId} AND b."order" IS DISTINCT FROM v.ord
    `);
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

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(pgSchema.users)
      .where(eq(pgSchema.users.googleId, googleId));
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async createUser(user: User): Promise<User> {
    await this.db.insert(pgSchema.users).values({
      id: user.id,
      email: user.email.toLowerCase(),
      name: user.name,
      passwordHash: user.passwordHash,
      avatarUrl: user.avatarUrl,
      googleId: user.googleId,
      role: user.role,
      isOwner: user.isOwner,
      mustChangePassword: user.mustChangePassword,
      approved: user.approved,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorCodeHash: user.twoFactorCodeHash,
      twoFactorCodeExpiresAt: user.twoFactorCodeExpiresAt,
      twoFactorCodeAttempts: user.twoFactorCodeAttempts,
      twoFactorCodePurpose: user.twoFactorCodePurpose,
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
    if (updates.isOwner !== undefined) updateData.isOwner = updates.isOwner;
    if (updates.mustChangePassword !== undefined)
      updateData.mustChangePassword = updates.mustChangePassword;
    if (updates.approved !== undefined) updateData.approved = updates.approved;
    if (updates.googleId !== undefined) updateData.googleId = updates.googleId;
    if (updates.twoFactorEnabled !== undefined) updateData.twoFactorEnabled = updates.twoFactorEnabled;
    if (updates.twoFactorCodeHash !== undefined) updateData.twoFactorCodeHash = updates.twoFactorCodeHash;
    if (updates.twoFactorCodeExpiresAt !== undefined)
      updateData.twoFactorCodeExpiresAt = updates.twoFactorCodeExpiresAt;
    if (updates.twoFactorCodeAttempts !== undefined)
      updateData.twoFactorCodeAttempts = updates.twoFactorCodeAttempts;
    if (updates.twoFactorCodePurpose !== undefined)
      updateData.twoFactorCodePurpose = updates.twoFactorCodePurpose;
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

  async findNearestPermission(pageId: string, userId: string): Promise<PermissionLevel | null> {
    // Nearest-ancestor-wins, matching permission-service's JS walk. Anchoring
    // on the literal pageId (not a pages lookup) preserves the behavior that a
    // direct permission wins even when the page row itself is missing.
    const result = await this.db.execute(sql`
      WITH RECURSIVE chain AS (
        SELECT ${pageId}::text AS id, 0 AS depth
        UNION ALL
        SELECT p.parent_id, c.depth + 1
        FROM pages p
        JOIN chain c ON p.id = c.id
        WHERE p.parent_id IS NOT NULL AND c.depth < 64
      )
      SELECT perm.level
      FROM chain
      JOIN permissions perm ON perm.page_id = chain.id AND perm.user_id = ${userId}
      ORDER BY chain.depth
      LIMIT 1
    `);
    const rows = result.rows as Array<{ level: PermissionLevel }>;
    return rows.length > 0 ? rows[0].level : null;
  }

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
    await this.db.insert(pgSchema.files).values({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      data: file.data,
      uploadedBy: file.uploadedBy,
      createdAt: new Date(createdAt),
    });
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
    const rows = await this.db
      .select({
        id: pgSchema.files.id,
        filename: pgSchema.files.filename,
        mimeType: pgSchema.files.mimeType,
        size: pgSchema.files.size,
        uploadedBy: pgSchema.files.uploadedBy,
        createdAt: pgSchema.files.createdAt,
      })
      .from(pgSchema.files)
      .where(eq(pgSchema.files.id, id));
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getFileData(id: string): Promise<Buffer | null> {
    const rows = await this.db
      .select({ data: pgSchema.files.data })
      .from(pgSchema.files)
      .where(eq(pgSchema.files.id, id));
    return rows.length > 0 ? rows[0].data : null;
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = await this.db.delete(pgSchema.files).where(eq(pgSchema.files.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ==================== Settings ====================

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(pgSchema.settings)
      .where(eq(pgSchema.settings.key, key));
    if (rows.length === 0) return null;
    // jsonb value is stored as-is; we serialize as JSON string for consistency
    const val = rows[0].value;
    return typeof val === 'string' ? val : JSON.stringify(val);
  }

  async setSetting(key: string, value: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(pgSchema.settings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: pgSchema.settings.key,
        set: { value, updatedAt: now },
      });
  }

  // ==================== Reference index ====================

  async setRowReferences(sourceRowId: string, propertyId: string, targetRowIds: string[]): Promise<void> {
    await this.db
      .delete(pgSchema.pageReferences)
      .where(
        and(
          eq(pgSchema.pageReferences.sourceRowId, sourceRowId),
          eq(pgSchema.pageReferences.propertyId, propertyId)
        )
      );
    const unique = Array.from(new Set(targetRowIds));
    if (unique.length > 0) {
      await this.db
        .insert(pgSchema.pageReferences)
        .values(unique.map((targetRowId) => ({ sourceRowId, propertyId, targetRowId })));
    }
  }

  async getReferencesToTarget(targetRowId: string): Promise<Array<{ sourceRowId: string; propertyId: string }>> {
    const rows = await this.db
      .select({
        sourceRowId: pgSchema.pageReferences.sourceRowId,
        propertyId: pgSchema.pageReferences.propertyId,
      })
      .from(pgSchema.pageReferences)
      .where(eq(pgSchema.pageReferences.targetRowId, targetRowId));
    return rows;
  }

  async deleteReferencesBySource(sourceRowId: string): Promise<void> {
    await this.db
      .delete(pgSchema.pageReferences)
      .where(eq(pgSchema.pageReferences.sourceRowId, sourceRowId));
  }

  async deleteReferencesByTarget(targetRowId: string): Promise<void> {
    await this.db
      .delete(pgSchema.pageReferences)
      .where(eq(pgSchema.pageReferences.targetRowId, targetRowId));
  }
}
