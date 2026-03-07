import type { Page, Block, User, PagePermission } from '@nonotion/shared';

export interface StorageAdapter {
  // Pages
  getAllPages(): Promise<Page[]>;
  getPage(id: string): Promise<Page | null>;
  createPage(page: Page): Promise<Page>;
  updatePage(id: string, updates: Partial<Page>): Promise<Page | null>;
  deletePage(id: string): Promise<boolean>;

  // Blocks
  getBlocksByPage(pageId: string): Promise<Block[]>;
  getBlock(id: string): Promise<Block | null>;
  createBlock(block: Block): Promise<Block>;
  updateBlock(id: string, updates: Partial<Block>): Promise<Block | null>;
  deleteBlock(id: string): Promise<boolean>;
  deleteBlocksByPage(pageId: string): Promise<void>;
  getBlocksByPages(pageIds: string[]): Promise<Block[]>;

  // Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
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
