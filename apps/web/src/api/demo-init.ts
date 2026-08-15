/**
 * One-time initialization for demo mode.
 * Called synchronously before React renders.
 */
import { createCreatedTimeProperty } from '@nonotion/shared';
import * as storage from './demo-storage';
import { isDemoSeeded } from './demo-storage';
import {
  seedDemoData,
  DEMO_USER,
  MENTION_DEMO_BLOCK_IDS,
  createMentionShowcaseBlocks,
} from './demo-data';

const PG_SHOWCASE = 'pg_demo_showcs1';

/**
 * Idempotent reconciliation for already-seeded demo users: ensure every
 * database schema contains the created_time system property.
 */
function ensureCreatedTimeProperty(): void {
  for (const page of storage.getAllPages()) {
    if (page.type !== 'database' || !page.databaseSchema) continue;
    const schema = page.databaseSchema;
    if (schema.properties.some((p) => p.type === 'created_time')) continue;
    const maxOrder = schema.properties.reduce((max, p) => Math.max(max, p.order), -1);
    storage.updatePage(page.id, {
      databaseSchema: {
        ...schema,
        properties: [...schema.properties, createCreatedTimeProperty(maxOrder + 1)],
      },
    });
  }
}

/**
 * Idempotent reconciliation for already-seeded demo users: end-append the
 * @-mention showcase blocks if they're missing.
 */
function ensureMentionShowcaseBlocks(): void {
  if (storage.getBlock(MENTION_DEMO_BLOCK_IDS[0])) return;
  if (!storage.getPage(PG_SHOWCASE)) return;
  const existing = storage.getBlocksByPage(PG_SHOWCASE);
  const maxOrder = existing.reduce((max, b) => Math.max(max, b.order), -1);
  for (const block of createMentionShowcaseBlocks(maxOrder + 1)) {
    storage.createBlock(block);
  }
}

export function initDemoMode(): void {
  // 1. Seed demo content if not already seeded
  if (!isDemoSeeded()) {
    seedDemoData();
  }
  ensureCreatedTimeProperty();
  ensureMentionShowcaseBlocks();

  // 2. Always ensure auth store has demo user + token in localStorage
  // so Zustand persist picks it up on hydration
  const authData = {
    state: {
      token: 'demo-token',
      user: { ...DEMO_USER },
      mustChangePassword: false,
      pendingApproval: false,
      authConfig: { enabledModes: ['db'] },
    },
    version: 0,
  };
  localStorage.setItem('nonotion-auth', JSON.stringify(authData));
}
