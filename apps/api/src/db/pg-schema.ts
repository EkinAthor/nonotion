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
    googleId: text('google_id'),
    role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
    isOwner: boolean('is_owner').notNull().default(false),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    approved: boolean('approved').notNull().default(true),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    twoFactorCodeHash: text('two_factor_code_hash'),
    twoFactorCodeExpiresAt: text('two_factor_code_expires_at'),
    twoFactorCodeAttempts: integer('two_factor_code_attempts').notNull().default(0),
    twoFactorCodePurpose: text('two_factor_code_purpose', { enum: ['login', 'enable'] }),
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
        'database_view',
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

// Page references index table (write-through, derived from reference property values).
// Denormalized junction used for indexed cascade cleanup and future reverse lookups.
// Canonical source of truth remains the JSON `properties` blob on pages.
export const pageReferences = pgTable(
  'page_references',
  {
    sourceRowId: text('source_row_id').notNull(),
    propertyId: text('property_id').notNull(),
    targetRowId: text('target_row_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceRowId, table.propertyId, table.targetRowId] }),
    index('idx_page_references_target').on(table.targetRowId),
    index('idx_page_references_source').on(table.sourceRowId),
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

// Settings table (key-value store for workspace settings)
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// MCP: per-user grant exposing a database via the MCP server
export const mcpDatabaseAccess = pgTable(
  'mcp_database_access',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    databaseId: text('database_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    allowImages: boolean('allow_images').notNull().default(false),
    allowFiles: boolean('allow_files').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.databaseId] }),
    index('idx_mcp_access_user').on(table.userId),
  ]
);

// MCP: personal access tokens (secret stored as sha256 hex, never plaintext)
export const mcpPersonalAccessTokens = pgTable(
  'mcp_personal_access_tokens',
  {
    id: text('id').primaryKey(), // mcpt_xxx
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    tokenSuffix: text('token_suffix').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('idx_mcp_pat_user').on(table.userId)]
);

// MCP OAuth: dynamically registered clients (public clients, PKCE only)
export const mcpOauthClients = pgTable('mcp_oauth_clients', {
  id: text('id').primaryKey(), // mcpc_xxx
  name: text('name').notNull(),
  redirectUris: jsonb('redirect_uris').notNull(), // string[]
  tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('none'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// MCP OAuth: single-use authorization codes (stored as sha256 hex)
export const mcpOauthCodes = pgTable('mcp_oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  codeChallengeMethod: text('code_challenge_method').notNull(),
  scope: text('scope').notNull().default('mcp:read'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// MCP OAuth: refresh tokens (sha256 at rest, rotated on use)
export const mcpOauthRefreshTokens = pgTable(
  'mcp_oauth_refresh_tokens',
  {
    id: text('id').primaryKey(), // mcprt_xxx
    tokenHash: text('token_hash').notNull().unique(),
    clientId: text('client_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull().default('mcp:read'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    rotatedToId: text('rotated_to_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('idx_mcp_refresh_user').on(table.userId)]
);

// Type exports for inference
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PageRow = typeof pages.$inferSelect;
export type NewPageRow = typeof pages.$inferInsert;
export type BlockRow = typeof blocks.$inferSelect;
export type NewBlockRow = typeof blocks.$inferInsert;
export type PermissionRow = typeof permissions.$inferSelect;
export type NewPermissionRow = typeof permissions.$inferInsert;
export type PageReferenceRow = typeof pageReferences.$inferSelect;
export type NewPageReferenceRow = typeof pageReferences.$inferInsert;
export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
export type SettingRow = typeof settings.$inferSelect;
export type NewSettingRow = typeof settings.$inferInsert;
export type McpDatabaseAccessRow = typeof mcpDatabaseAccess.$inferSelect;
export type McpPersonalAccessTokenRow = typeof mcpPersonalAccessTokens.$inferSelect;
export type McpOauthClientRow = typeof mcpOauthClients.$inferSelect;
export type McpOauthCodeRow = typeof mcpOauthCodes.$inferSelect;
export type McpOauthRefreshTokenRow = typeof mcpOauthRefreshTokens.$inferSelect;
