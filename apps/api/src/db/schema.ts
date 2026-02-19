import { sqliteTable, text, integer, blob, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // usr_xxx
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  approved: integer('approved', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const permissions = sqliteTable('permissions', {
  pageId: text('page_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  level: text('level', { enum: ['owner', 'full_access', 'editor', 'viewer'] }).notNull(),
  grantedBy: text('granted_by').notNull(),
  grantedAt: text('granted_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.pageId, table.userId] }),
]);

// Pages table
export const pages = sqliteTable('pages', {
  id: text('id').primaryKey(), // pg_xxx
  title: text('title').notNull(),
  type: text('type', { enum: ['document', 'database'] }).notNull().default('document'),
  ownerId: text('owner_id').notNull(),
  parentId: text('parent_id'),
  childIds: text('child_ids').notNull().default('[]'), // JSON-serialized string[]
  icon: text('icon'),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  version: integer('version').notNull().default(1),
  databaseSchema: text('database_schema'), // JSON-serialized DatabaseSchema
  properties: text('properties'), // JSON-serialized Record<string, PropertyValue>
}, (table) => [
  index('idx_pages_owner_id').on(table.ownerId),
  index('idx_pages_parent_id').on(table.parentId),
  index('idx_pages_type').on(table.type),
]);

// Blocks table
export const blocks = sqliteTable('blocks', {
  id: text('id').primaryKey(), // blk_xxx
  type: text('type', {
    enum: [
      'heading',
      'heading2',
      'heading3',
      'paragraph',
      'bullet_list',
      'numbered_list',
      'checklist',
      'code_block',
      'image',
    ],
  }).notNull(),
  pageId: text('page_id').notNull(),
  order: integer('order').notNull(),
  content: text('content').notNull(), // JSON-serialized BlockContent
  version: integer('version').notNull().default(1),
}, (table) => [
  index('idx_blocks_page_id').on(table.pageId),
  index('idx_blocks_page_order').on(table.pageId, table.order),
]);

// Files table
export const files = sqliteTable('files', {
  id: text('id').primaryKey(), // file_xxx
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PermissionRow = typeof permissions.$inferSelect;
export type NewPermissionRow = typeof permissions.$inferInsert;
export type PageRow = typeof pages.$inferSelect;
export type NewPageRow = typeof pages.$inferInsert;
export type BlockRow = typeof blocks.$inferSelect;
export type NewBlockRow = typeof blocks.$inferInsert;
export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
