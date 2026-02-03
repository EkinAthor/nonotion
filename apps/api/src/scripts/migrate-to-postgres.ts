/**
 * Migration script to move data from JSON/SQLite storage to PostgreSQL
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm --filter @nonotion/api migrate:to-postgres
 *
 * This script:
 * 1. Reads all data from JSON files (pages, blocks) and SQLite (users, permissions)
 * 2. Writes all data to PostgreSQL
 * 3. Does NOT delete the original data - you should verify and delete manually
 */

import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import * as sqliteSchema from '../db/schema.js';
import * as pgSchema from '../db/pg-schema.js';
import type { Page, Block, User, PagePermission, UserRole } from '@nonotion/shared';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '../../data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');
const BLOCKS_DIR = path.join(DATA_DIR, 'blocks');
const DB_PATH = path.join(DATA_DIR, 'nonotion.db');

async function loadJsonPages(): Promise<Page[]> {
  const pages: Page[] = [];
  try {
    const files = await fs.readdir(PAGES_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(PAGES_DIR, file), 'utf-8');
        const page = JSON.parse(content) as Page;
        if (!page.type) {
          page.type = 'document';
        }
        pages.push(page);
      }
    }
  } catch {
    console.log('No pages directory found or empty');
  }
  return pages;
}

async function loadJsonBlocks(): Promise<Block[]> {
  const allBlocks: Block[] = [];
  try {
    const files = await fs.readdir(BLOCKS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(BLOCKS_DIR, file), 'utf-8');
        const blocks = JSON.parse(content) as Block[];
        allBlocks.push(...blocks);
      }
    }
  } catch {
    console.log('No blocks directory found or empty');
  }
  return allBlocks;
}

function loadSqliteUsers(sqliteDb: ReturnType<typeof drizzleSqlite>): User[] {
  const rows = sqliteDb.select().from(sqliteSchema.users).all();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    avatarUrl: row.avatarUrl,
    role: row.role as UserRole,
    mustChangePassword: row.mustChangePassword,
    approved: row.approved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function loadSqlitePermissions(sqliteDb: ReturnType<typeof drizzleSqlite>): PagePermission[] {
  const rows = sqliteDb.select().from(sqliteSchema.permissions).all();
  return rows.map((row) => ({
    pageId: row.pageId,
    userId: row.userId,
    level: row.level as PagePermission['level'],
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
  }));
}

async function main() {
  const postgresUrl = process.env.DATABASE_URL;
  if (!postgresUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('=== Nonotion Data Migration: JSON/SQLite -> PostgreSQL ===\n');
  console.log('Data directory:', DATA_DIR);
  console.log('PostgreSQL URL:', postgresUrl.replace(/:[^:@]+@/, ':****@'));
  console.log('');

  // Load JSON data
  console.log('Loading pages from JSON...');
  const pages = await loadJsonPages();
  console.log(`  Found ${pages.length} pages`);

  console.log('Loading blocks from JSON...');
  const blocks = await loadJsonBlocks();
  console.log(`  Found ${blocks.length} blocks`);

  // Load SQLite data
  let users: User[] = [];
  let permissions: PagePermission[] = [];

  try {
    console.log('Loading users from SQLite...');
    const sqlite = new Database(DB_PATH);
    sqlite.pragma('foreign_keys = ON');
    const sqliteDb = drizzleSqlite(sqlite, { schema: sqliteSchema });

    users = loadSqliteUsers(sqliteDb);
    console.log(`  Found ${users.length} users`);

    console.log('Loading permissions from SQLite...');
    permissions = loadSqlitePermissions(sqliteDb);
    console.log(`  Found ${permissions.length} permissions`);

    sqlite.close();
  } catch (error) {
    console.log('  No SQLite database found or error reading:', error);
  }

  if (pages.length === 0 && blocks.length === 0 && users.length === 0) {
    console.log('\nNo data to migrate. Exiting.');
    return;
  }

  // Connect to PostgreSQL
  console.log('\nConnecting to PostgreSQL...');
  const pool = new Pool({ connectionString: postgresUrl });
  const pgDb = drizzle(pool, { schema: pgSchema });

  try {
    // Insert users first (foreign key constraint)
    if (users.length > 0) {
      console.log(`\nMigrating ${users.length} users...`);
      for (const user of users) {
        try {
          await pgDb.insert(pgSchema.users).values({
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
          console.log(`  ✓ User: ${user.email}`);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('duplicate key')) {
            console.log(`  - User already exists: ${user.email}`);
          } else {
            console.error(`  ✗ Failed to migrate user ${user.email}:`, msg);
          }
        }
      }
    }

    // Insert pages
    if (pages.length > 0) {
      console.log(`\nMigrating ${pages.length} pages...`);
      for (const page of pages) {
        try {
          await pgDb.insert(pgSchema.pages).values({
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
          console.log(`  ✓ Page: ${page.title} (${page.id})`);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('duplicate key')) {
            console.log(`  - Page already exists: ${page.title} (${page.id})`);
          } else {
            console.error(`  ✗ Failed to migrate page ${page.id}:`, msg);
          }
        }
      }
    }

    // Insert blocks
    if (blocks.length > 0) {
      console.log(`\nMigrating ${blocks.length} blocks...`);
      for (const block of blocks) {
        try {
          await pgDb.insert(pgSchema.blocks).values({
            id: block.id,
            type: block.type,
            pageId: block.pageId,
            order: block.order,
            content: block.content,
            version: block.version,
          });
          console.log(`  ✓ Block: ${block.id}`);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('duplicate key')) {
            console.log(`  - Block already exists: ${block.id}`);
          } else {
            console.error(`  ✗ Failed to migrate block ${block.id}:`, msg);
          }
        }
      }
    }

    // Insert permissions
    if (permissions.length > 0) {
      console.log(`\nMigrating ${permissions.length} permissions...`);
      for (const perm of permissions) {
        try {
          await pgDb.insert(pgSchema.permissions).values({
            pageId: perm.pageId,
            userId: perm.userId,
            level: perm.level,
            grantedBy: perm.grantedBy,
            grantedAt: new Date(perm.grantedAt),
          });
          console.log(`  ✓ Permission: ${perm.userId} -> ${perm.pageId} (${perm.level})`);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('duplicate key')) {
            console.log(`  - Permission already exists: ${perm.userId} -> ${perm.pageId}`);
          } else {
            console.error(`  ✗ Failed to migrate permission:`, msg);
          }
        }
      }
    }

    console.log('\n=== Migration complete! ===');
    console.log('\nTo use PostgreSQL, set these environment variables:');
    console.log('  STORAGE_TYPE=postgres');
    console.log('  DATABASE_URL=your-postgresql-url');
    console.log('\nNote: Original JSON/SQLite data was NOT deleted.');
    console.log('Please verify the migration and delete manually if needed.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
