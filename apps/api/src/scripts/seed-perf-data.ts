/**
 * Perf seed script: loads a LARGE synthetic dataset into the backend storage
 * for performance testing. NOT part of the demo data — run on demand only.
 *
 * Usage:
 *   pnpm --filter @nonotion/api seed:perf            # seed (idempotent, marker-guarded)
 *   pnpm --filter @nonotion/api seed:perf -- --force # re-run entity-by-entity even if marker set
 *   pnpm --filter @nonotion/api seed:perf -- --clean # remove all perf data
 *
 * Creates (all ids carry a `_perf_` infix so --clean can never touch real data):
 *   - ~3,110 document pages: root -> 10 sections -> 10 subsections -> 30 leaf docs
 *   - 2 paragraph blocks per leaf doc (~6,000 blocks)
 *   - Main database (2,000 rows, 9 property types incl. a reference property)
 *   - Referenced database (500 rows)
 *   - A view page embedding the main database
 *   - perf-user@example.com (non-owner) with one editor grant on section 1
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { hashSync } from 'bcryptjs';
import type { Page, Block, PagePermission, PropertyValue, User } from '@nonotion/shared';
import { generateUserId } from '@nonotion/shared';
import {
  initializeStorage,
  getStorage,
  getUserStorage,
  getStorageType,
  closeStorage,
} from '../storage/storage-factory.js';
import type { StorageType } from '../storage/storage-factory.js';

const NOW = '2026-03-01T00:00:00.000Z';
const SEED_VERSION = '1';
const MARKER_KEY = 'perf_seed_version';
const PERF_INFIX = '_perf_';

// ─── Stable IDs ───────────────────────────────────────────────────────────────
const PG_ROOT = 'pg_perf_root0001';
const PG_DB_MAIN = 'pg_perf_dbmain01';
const PG_DB_REF = 'pg_perf_dbref001';
const PG_VIEW = 'pg_perf_view0001';
const PERF_USER_EMAIL = 'perf-user@example.com';

const secId = (s: number) => `pg_perf_sec_${String(s).padStart(2, '0')}`;
const subId = (s: number, u: number) =>
  `pg_perf_sub_${String(s).padStart(2, '0')}${String(u).padStart(2, '0')}`;
const docId = (n: number) => `pg_perf_doc_${String(n).padStart(5, '0')}`;
const rowId = (n: number) => `pg_perf_row_${String(n).padStart(4, '0')}`;
const refId = (n: number) => `pg_perf_ref_${String(n).padStart(4, '0')}`;

// ─── Main database schema ─────────────────────────────────────────────────────
const PROP_TITLE = 'prop_perf_title';
const PROP_NOTES = 'prop_perf_notes';
const PROP_STATUS = 'prop_perf_stats';
const PROP_TAGS = 'prop_perf_tagss';
const PROP_DUE = 'prop_perf_duedt';
const PROP_DONE = 'prop_perf_donee';
const PROP_LINK = 'prop_perf_linkk';
const PROP_ASSIGNEE = 'prop_perf_assgn';
const PROP_RELATED = 'prop_perf_relat';

const STATUS_OPTS = ['opt_perf_st_bcklg', 'opt_perf_st_doing', 'opt_perf_st_revie', 'opt_perf_st_donee'];
const TAG_OPTS = Array.from({ length: 8 }, (_, i) => `opt_perf_tag_${String(i + 1).padStart(2, '0')}`);

const mainSchema = {
  properties: [
    { id: PROP_TITLE, name: 'Name', type: 'title' as const, order: 0 },
    { id: PROP_NOTES, name: 'Notes', type: 'text' as const, order: 1 },
    {
      id: PROP_STATUS,
      name: 'Status',
      type: 'select' as const,
      order: 2,
      options: [
        { id: STATUS_OPTS[0], name: 'Backlog', color: 'gray' as const },
        { id: STATUS_OPTS[1], name: 'In Progress', color: 'blue' as const },
        { id: STATUS_OPTS[2], name: 'Review', color: 'yellow' as const },
        { id: STATUS_OPTS[3], name: 'Done', color: 'green' as const },
      ],
    },
    {
      id: PROP_TAGS,
      name: 'Tags',
      type: 'multi_select' as const,
      order: 3,
      options: TAG_OPTS.map((id, i) => ({
        id,
        name: `Tag ${i + 1}`,
        color: (['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'] as const)[i],
      })),
    },
    { id: PROP_DUE, name: 'Due', type: 'date' as const, order: 4 },
    { id: PROP_DONE, name: 'Done', type: 'checkbox' as const, order: 5 },
    { id: PROP_LINK, name: 'Link', type: 'url' as const, order: 6 },
    { id: PROP_ASSIGNEE, name: 'Assignee', type: 'person' as const, order: 7 },
    {
      id: PROP_RELATED,
      name: 'Related',
      type: 'reference' as const,
      order: 8,
      referencedDatabaseId: PG_DB_REF,
    },
  ],
};

// ─── Referenced database schema ───────────────────────────────────────────────
const RPROP_TITLE = 'prop_perf_rtitl';
const RPROP_DESC = 'prop_perf_rdesc';
const RPROP_KIND = 'prop_perf_rkind';
const KIND_OPTS = ['opt_perf_kd_alpha', 'opt_perf_kd_betaa', 'opt_perf_kd_gamma'];

const refSchema = {
  properties: [
    { id: RPROP_TITLE, name: 'Name', type: 'title' as const, order: 0 },
    { id: RPROP_DESC, name: 'Description', type: 'text' as const, order: 1 },
    {
      id: RPROP_KIND,
      name: 'Kind',
      type: 'select' as const,
      order: 2,
      options: [
        { id: KIND_OPTS[0], name: 'Alpha', color: 'blue' as const },
        { id: KIND_OPTS[1], name: 'Beta', color: 'green' as const },
        { id: KIND_OPTS[2], name: 'Gamma', color: 'purple' as const },
      ],
    },
  ],
};

const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];

function basePage(id: string, title: string, ownerId: string, parentId: string | null): Page {
  return {
    id,
    title,
    type: 'document',
    ownerId,
    parentId,
    childIds: [],
    icon: null,
    isStarred: false,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };
}

// Deterministic date spread over ~2 years starting 2025-01-01.
function dueDate(i: number): string {
  const d = new Date(Date.UTC(2025, 0, 1));
  d.setUTCDate(d.getUTCDate() + (i % 730));
  return d.toISOString().slice(0, 10);
}

function mainRow(i: number, ownerId: string): { page: Page; refs: string[] } {
  const word = WORDS[i % WORDS.length];
  const refCount = i % 10 === 2 ? 0 : i % 4;
  const refs = Array.from({ length: refCount }, (_, k) => refId(((i * 7 + k * 131) % 500) + 1));

  const properties: Record<string, PropertyValue> = {
    [PROP_TITLE]: { type: 'title', value: `Perf Row ${String(i).padStart(4, '0')} ${word}` },
    [PROP_NOTES]: { type: 'text', value: i % 10 === 0 ? '' : `Notes for row ${i} (${word})` },
    [PROP_STATUS]: { type: 'select', value: i % 10 === 3 ? null : STATUS_OPTS[i % 4] },
    [PROP_TAGS]: {
      type: 'multi_select',
      value: i % 10 === 5 ? [] : [TAG_OPTS[i % 8], TAG_OPTS[(i + 3) % 8]],
    },
    [PROP_DUE]: { type: 'date', value: i % 10 === 7 ? null : dueDate(i) },
    [PROP_DONE]: { type: 'checkbox', value: i % 3 === 0 },
    [PROP_LINK]: { type: 'url', value: i % 10 === 9 ? '' : `https://example.com/row/${i}` },
    [PROP_ASSIGNEE]: { type: 'person', value: i % 5 === 0 ? ownerId : null },
    [PROP_RELATED]: { type: 'reference', value: refs },
  };

  const page: Page = {
    ...basePage(rowId(i), `Perf Row ${String(i).padStart(4, '0')} ${word}`, ownerId, PG_DB_MAIN),
    properties,
  };
  return { page, refs };
}

function refRow(i: number, ownerId: string): Page {
  const word = WORDS[i % WORDS.length];
  return {
    ...basePage(refId(i), `Ref Item ${String(i).padStart(3, '0')} ${word}`, ownerId, PG_DB_REF),
    properties: {
      [RPROP_TITLE]: { type: 'title', value: `Ref Item ${String(i).padStart(3, '0')} ${word}` },
      [RPROP_DESC]: { type: 'text', value: `Referenced item number ${i}` },
      [RPROP_KIND]: { type: 'select', value: KIND_OPTS[i % 3] },
    },
  };
}

// ─── Migrations (same pattern as seed-demo-data.ts) ───────────────────────────

async function runMigrations(): Promise<void> {
  if (getStorageType() === 'postgres') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);
    const candidates = [
      path.resolve(process.cwd(), 'drizzle-pg'),
      path.resolve(process.cwd(), 'apps', 'api', 'drizzle-pg'),
    ];
    const migrationsFolder = candidates.find((p) => fs.existsSync(p)) || candidates[0];

    try {
      await migrate(db, { migrationsFolder });
    } finally {
      await pool.end();
    }
  } else {
    const { db } = await import('../db/index.js');
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
    const candidates = [
      path.resolve(process.cwd(), 'drizzle'),
      path.resolve(process.cwd(), 'apps', 'api', 'drizzle'),
    ];
    const migrationsFolder = candidates.find((p) => fs.existsSync(p)) || candidates[0];
    migrate(db, { migrationsFolder });
  }
}

// ─── Owner resolution ─────────────────────────────────────────────────────────

async function resolveOwner(): Promise<User> {
  const userStorage = getUserStorage();
  for (const email of ['admin@example.net', 'admin@example.com']) {
    const user = await userStorage.getUserByEmail(email);
    if (user) return user;
  }
  const anyOwner = (await userStorage.getAllUsers()).find((u) => u.isOwner);
  if (anyOwner) return anyOwner;

  const created = await userStorage.createUser({
    id: generateUserId(),
    email: 'admin@example.net',
    name: 'Admin',
    passwordHash: hashSync('adminadmin', 10),
    avatarUrl: null,
    googleId: null,
    role: 'admin',
    isOwner: true,
    mustChangePassword: false,
    approved: true,
    twoFactorEnabled: false,
    twoFactorCodeHash: null,
    twoFactorCodeExpiresAt: null,
    twoFactorCodeAttempts: 0,
    twoFactorCodePurpose: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  console.log(`Created owner user admin@example.net (${created.id})`);
  return created;
}

// ─── Clean ────────────────────────────────────────────────────────────────────

async function clean(): Promise<void> {
  const storage = getStorage();
  const userStorage = getUserStorage();

  const perfPages = (await storage.getAllPages()).filter((p) => p.id.includes(PERF_INFIX));
  console.log(`Removing ${perfPages.length} perf pages...`);
  let done = 0;
  for (const page of perfPages) {
    await storage.deleteBlocksByPage(page.id);
    await userStorage.deletePagePermissions(page.id);
    await storage.deleteReferencesBySource(page.id);
    await storage.deletePage(page.id);
    if (++done % 500 === 0) console.log(`  ${done}/${perfPages.length}`);
  }

  const perfUser = await userStorage.getUserByEmail(PERF_USER_EMAIL);
  if (perfUser) {
    await userStorage.deleteUserPermissions(perfUser.id);
    await userStorage.deleteUser(perfUser.id);
    console.log(`Removed ${PERF_USER_EMAIL}`);
  }

  await storage.setSetting(MARKER_KEY, '');
  console.log('Perf data removed.');
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function createPageIfMissing(page: Page): Promise<boolean> {
  const storage = getStorage();
  if (await storage.getPage(page.id)) return false;
  await storage.createPage(page);
  return true;
}

async function seed(force: boolean): Promise<void> {
  const storage = getStorage();
  const userStorage = getUserStorage();

  const marker = await storage.getSetting(MARKER_KEY);
  if (marker === SEED_VERSION && !force) {
    console.log('Perf data already seeded (marker set). Use --force to re-run, --clean to remove.');
    return;
  }

  const owner = await resolveOwner();
  const ownerId = owner.id;
  console.log(`Seeding perf data owned by ${owner.email} (${ownerId})...`);

  // ── Build the page tree in memory ──────────────────────────────────────────
  const pages: Page[] = [];
  const root = basePage(PG_ROOT, 'Perf Test Workspace', ownerId, null);
  root.icon = '⏱️';

  let docN = 0;
  for (let s = 1; s <= 10; s++) {
    const section = basePage(secId(s), `Perf Section ${s}`, ownerId, PG_ROOT);
    root.childIds.push(section.id);
    for (let u = 1; u <= 10; u++) {
      const sub = basePage(subId(s, u), `Perf Subsection ${s}.${u}`, ownerId, section.id);
      section.childIds.push(sub.id);
      for (let d = 1; d <= 30; d++) {
        docN++;
        const doc = basePage(docId(docN), `Perf Doc ${docN} ${WORDS[docN % WORDS.length]}`, ownerId, sub.id);
        sub.childIds.push(doc.id);
        pages.push(doc);
      }
      pages.push(sub);
    }
    pages.push(section);
  }

  const dbMain: Page = {
    ...basePage(PG_DB_MAIN, 'Perf Tasks', ownerId, PG_ROOT),
    type: 'database',
    icon: '📋',
    databaseSchema: mainSchema,
    childIds: Array.from({ length: 2000 }, (_, i) => rowId(i + 1)),
  };
  const dbRef: Page = {
    ...basePage(PG_DB_REF, 'Perf Reference Items', ownerId, PG_ROOT),
    type: 'database',
    icon: '🔗',
    databaseSchema: refSchema,
    childIds: Array.from({ length: 500 }, (_, i) => refId(i + 1)),
  };
  const viewPage = basePage(PG_VIEW, 'Perf View Page', ownerId, PG_ROOT);
  root.childIds.push(PG_DB_MAIN, PG_DB_REF, PG_VIEW);

  const refRows = Array.from({ length: 500 }, (_, i) => refRow(i + 1, ownerId));
  const mainRows = Array.from({ length: 2000 }, (_, i) => mainRow(i + 1, ownerId));

  // Parents before children so hierarchy is never dangling mid-seed.
  const orderedPages: Page[] = [root, ...pages.reverse(), dbRef, ...refRows, dbMain, ...mainRows.map((r) => r.page), viewPage];

  let created = 0;
  let skipped = 0;
  for (const page of orderedPages) {
    if (await createPageIfMissing(page)) created++;
    else skipped++;
    if ((created + skipped) % 1000 === 0) console.log(`  pages: ${created + skipped}/${orderedPages.length}`);
  }
  console.log(`Pages: ${created} created, ${skipped} skipped`);

  // ── Reference index (write-through, mirrors updateRowProperties) ───────────
  let refLinks = 0;
  for (const { page, refs } of mainRows) {
    if (refs.length > 0) {
      await storage.setRowReferences(page.id, PROP_RELATED, refs);
      refLinks++;
    }
  }
  console.log(`Reference index: ${refLinks} rows linked`);

  // ── Blocks ─────────────────────────────────────────────────────────────────
  // The db-view block is created last, so its existence means all blocks exist.
  const allBlocksDone = await storage.getBlock('blk_perf_dbview01');
  let blocksCreated = 0;
  if (!allBlocksDone) {
    const createBlockIfMissing = async (block: Block): Promise<void> => {
      if (!(await storage.getBlock(block.id))) {
        await storage.createBlock(block);
        blocksCreated++;
      }
    };
    for (let n = 1; n <= docN; n++) {
      const pageId = docId(n);
      await createBlockIfMissing({
        id: `blk_perf_h_${String(n).padStart(5, '0')}`,
        type: 'heading',
        pageId,
        order: 0,
        content: { text: `Perf Doc ${n}`, level: 1 },
        version: 1,
      });
      await createBlockIfMissing({
        id: `blk_perf_p_${String(n).padStart(5, '0')}`,
        type: 'paragraph',
        pageId,
        order: 1,
        content: { text: `Synthetic content for perf doc ${n}: ${WORDS[n % WORDS.length]} ipsum dolor sit amet.` },
        version: 1,
      });
      if (n % 500 === 0) console.log(`  blocks: ${blocksCreated}`);
    }
    await createBlockIfMissing({
      id: 'blk_perf_dbview01',
      type: 'database_view',
      pageId: PG_VIEW,
      order: 0,
      content: { databaseId: PG_DB_MAIN },
      version: 1,
    });
  }
  console.log(`Blocks: ${blocksCreated} created`);

  // ── Permissions ────────────────────────────────────────────────────────────
  if (!(await userStorage.getPermission(PG_ROOT, ownerId))) {
    const perm: PagePermission = {
      pageId: PG_ROOT,
      userId: ownerId,
      level: 'owner',
      grantedBy: ownerId,
      grantedAt: NOW,
    };
    await userStorage.createPermission(perm);
  }

  let perfUser = await userStorage.getUserByEmail(PERF_USER_EMAIL);
  if (!perfUser) {
    perfUser = await userStorage.createUser({
      id: generateUserId(),
      email: PERF_USER_EMAIL,
      name: 'Perf User',
      passwordHash: hashSync('perfperf', 10),
      avatarUrl: null,
      googleId: null,
      role: 'user',
      isOwner: false,
      mustChangePassword: false,
      approved: true,
      twoFactorEnabled: false,
      twoFactorCodeHash: null,
      twoFactorCodeExpiresAt: null,
      twoFactorCodeAttempts: 0,
      twoFactorCodePurpose: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    console.log(`Created ${PERF_USER_EMAIL} (password: perfperf)`);
  }
  if (!(await userStorage.getPermission(secId(1), perfUser.id))) {
    await userStorage.createPermission({
      pageId: secId(1),
      userId: perfUser.id,
      level: 'editor',
      grantedBy: ownerId,
      grantedAt: NOW,
    });
  }

  await storage.setSetting(MARKER_KEY, SEED_VERSION);
  console.log('\nDone! Perf data seeded. View page: /page/' + PG_VIEW);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const storageType: StorageType = (process.env.STORAGE_TYPE as StorageType) || 'sqlite';

  await initializeStorage({
    type: storageType,
    postgresUrl: process.env.DATABASE_URL,
  });
  await runMigrations();

  if (args.includes('--clean')) {
    await clean();
  } else {
    await seed(args.includes('--force'));
  }

  await closeStorage();
}

main().catch((err) => {
  console.error('Perf seed failed:', err);
  process.exit(1);
});
