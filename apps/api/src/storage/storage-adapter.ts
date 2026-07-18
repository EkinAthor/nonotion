import type { Page, Block, User, PagePermission, PermissionLevel } from '@nonotion/shared';

/**
 * Parameters for the optional SQL fast path serving database-row fetches.
 * Only the title-contains filter is SQL-translated; anything else must go
 * through the JS filter/sort path in database-service.
 */
export interface DatabaseRowsQuery {
  databaseId: string;
  /** Case-insensitive substring match against page titles, or null for no filter. */
  titleContains: string | null;
  /** The database page's childIds — defines row order (missing ids sort last). */
  childIdsOrder: string[];
  limit: number;
  offset: number;
}

export interface StorageAdapter {
  // Pages
  getAllPages(): Promise<Page[]>;
  getPage(id: string): Promise<Page | null>;
  getPagesByParent(parentId: string): Promise<Page[]>;
  getPagesByIds(ids: string[]): Promise<Page[]>;
  createPage(page: Page): Promise<Page>;
  updatePage(id: string, updates: Partial<Page>): Promise<Page | null>;
  deletePage(id: string): Promise<boolean>;

  /**
   * Optional SQL fast path for database rows: filter/order/paginate/count in
   * one query. Backends that don't implement it (SQLite) fall back to the JS
   * path in database-service, which must stay behaviorally identical.
   */
  queryDatabaseRows?(query: DatabaseRowsQuery): Promise<{ pages: Page[]; total: number }>;

  // Blocks
  getBlocksByPage(pageId: string): Promise<Block[]>;
  getBlock(id: string): Promise<Block | null>;
  createBlock(block: Block): Promise<Block>;
  updateBlock(id: string, updates: Partial<Block>): Promise<Block | null>;
  deleteBlock(id: string): Promise<boolean>;
  deleteBlocksByPage(pageId: string): Promise<void>;
  getBlocksByPages(pageIds: string[]): Promise<Block[]>;
  /** Batch-update block orders (bumping versions) atomically — one statement/transaction. */
  updateBlockOrders(pageId: string, orders: Array<{ id: string; order: number }>): Promise<void>;

  // Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  // Reference index (write-through junction, derived from reference property values)
  setRowReferences(sourceRowId: string, propertyId: string, targetRowIds: string[]): Promise<void>;
  getReferencesToTarget(targetRowId: string): Promise<Array<{ sourceRowId: string; propertyId: string }>>;
  deleteReferencesBySource(sourceRowId: string): Promise<void>;
  deleteReferencesByTarget(targetRowId: string): Promise<void>;
}

export interface UserStorageAdapter {
  // Users
  getAllUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByGoogleId(googleId: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | null>;
  deleteUser(id: string): Promise<boolean>;
  countUsers(): Promise<number>;

  // Permissions
  /**
   * Optional single-query nearest-ancestor permission lookup (recursive CTE).
   * Semantics must match permission-service's JS walk: a direct permission on
   * pageId wins, then the closest ancestor with one. Backends without it
   * (SQLite) fall back to the per-level JS walk.
   */
  findNearestPermission?(pageId: string, userId: string): Promise<PermissionLevel | null>;
  getPagePermissions(pageId: string): Promise<PagePermission[]>;
  getUserPermissions(userId: string): Promise<PagePermission[]>;
  getPermission(pageId: string, userId: string): Promise<PagePermission | null>;
  createPermission(permission: PagePermission): Promise<PagePermission>;
  updatePermission(pageId: string, userId: string, updates: Partial<PagePermission>): Promise<PagePermission | null>;
  deletePermission(pageId: string, userId: string): Promise<boolean>;
  deletePagePermissions(pageId: string): Promise<void>;
  transferOwnerPermissions(fromUserId: string, toUserId: string): Promise<void>;
  deleteUserPermissions(userId: string): Promise<void>;
}
