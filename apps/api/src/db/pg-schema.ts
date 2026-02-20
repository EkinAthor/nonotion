import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  index,
  customType,
} from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // usr_xxx
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    avatarUrl: text('avatar_url'),
    role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    approved: boolean('approved').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('idx_users_email').on(table.email)]
);

// Pages table
export const pages = pgTable(
  'pages',
  {
    id: text('id').primaryKey(), // pg_xxx
    title: text('title').notNull(),
    type: text('type', { enum: ['document', 'database'] })
      .notNull()
      .default('document'),
    ownerId: text('owner_id').notNull(),
    parentId: text('parent_id'),
    childIds: text('child_ids').array().notNull().default([]),
    icon: text('icon'),
    isStarred: boolean('is_starred').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(1),
    databaseSchema: jsonb('database_schema'), // For database pages
    properties: jsonb('properties'), // For database row pages
  },
  (table) => [
    index('idx_pages_owner_id').on(table.ownerId),
    index('idx_pages_parent_id').on(table.parentId),
    index('idx_pages_type').on(table.type),
  ]
);

// Blocks table
export const blocks = pgTable(
  'blocks',
  {
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
        'divider',
        'page_link',
      ],
    }).notNull(),
    pageId: text('page_id').notNull(),
    order: integer('order').notNull(),
    content: jsonb('content').notNull(), // { text: "...", level?: 1 } or other content types
    version: integer('version').notNull().default(1),
  },
  (table) => [
    index('idx_blocks_page_id').on(table.pageId),
    index('idx_blocks_page_order').on(table.pageId, table.order),
  ]
);

// Permissions table
export const permissions = pgTable(
  'permissions',
  {
    pageId: text('page_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    level: text('level', { enum: ['owner', 'full_access', 'editor', 'viewer'] }).notNull(),
    grantedBy: text('granted_by').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pageId, table.userId] }),
    index('idx_permissions_user_id').on(table.userId),
  ]
);

// Custom type for bytea columns
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// Files table
export const files = pgTable('files', {
  id: text('id').primaryKey(), // file_xxx
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  data: bytea('data').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// Type exports for inference
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PageRow = typeof pages.$inferSelect;
export type NewPageRow = typeof pages.$inferInsert;
export type BlockRow = typeof blocks.$inferSelect;
export type NewBlockRow = typeof blocks.$inferInsert;
export type PermissionRow = typeof permissions.$inferSelect;
export type NewPermissionRow = typeof permissions.$inferInsert;
export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
