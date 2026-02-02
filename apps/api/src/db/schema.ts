import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

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

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PermissionRow = typeof permissions.$inferSelect;
export type NewPermissionRow = typeof permissions.$inferInsert;
