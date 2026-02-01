/**
 * Migration script for Phase 2: Multi-user support
 *
 * This script handles migrating existing pages to have ownership
 * when the first admin user registers.
 *
 * Run with: pnpm tsx src/scripts/migrate-to-multiuser.ts
 */

import { storage } from '../storage/json-storage.js';
import { userStorage } from '../storage/sqlite-storage.js';
import { now } from '@nonotion/shared';

async function migrate() {
  console.log('Starting migration to multi-user support...\n');

  // Initialize storage
  await storage.getAllPages(); // This triggers init

  // Check if any users exist
  const userCount = await userStorage.countUsers();

  if (userCount === 0) {
    console.log('No users registered yet.');
    console.log('When the first user registers (or registers with ADMIN_EMAIL), they will become admin.');
    console.log('All existing pages will be assigned to the first admin user after they register.\n');
    console.log('To register the first admin user:');
    console.log('1. Set ADMIN_EMAIL environment variable (optional)');
    console.log('2. Start the app and navigate to /register');
    console.log('3. Register with the admin email (or any email if ADMIN_EMAIL is not set)\n');
    return;
  }

  // Get all admins
  const allUsers = await userStorage.getAllUsers();
  const admins = allUsers.filter((u) => u.role === 'admin');

  if (admins.length === 0) {
    console.log('No admin users found. Cannot assign page ownership.');
    console.log('Make a user an admin first.\n');
    return;
  }

  const firstAdmin = admins[0];
  console.log(`Found admin user: ${firstAdmin.email}\n`);

  // Get all pages
  const pages = await storage.getAllPages();
  console.log(`Found ${pages.length} pages\n`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const page of pages) {
    // Check if this page already has permissions
    const existingPermissions = await userStorage.getPagePermissions(page.id);

    if (existingPermissions.length > 0) {
      console.log(`Page "${page.title}" (${page.id}) - already has permissions, skipping`);
      skippedCount++;
      continue;
    }

    // Update page with ownerId if it doesn't have one
    if (!page.ownerId) {
      await storage.updatePage(page.id, {
        ownerId: firstAdmin.id,
        updatedAt: now(),
        version: page.version + 1,
      });
    }

    // Create owner permission
    const timestamp = now();
    await userStorage.createPermission({
      pageId: page.id,
      userId: firstAdmin.id,
      level: 'owner',
      grantedBy: firstAdmin.id,
      grantedAt: timestamp,
    });

    console.log(`Page "${page.title}" (${page.id}) - assigned to ${firstAdmin.email}`);
    migratedCount++;
  }

  console.log(`\nMigration complete!`);
  console.log(`- Migrated: ${migratedCount} pages`);
  console.log(`- Skipped: ${skippedCount} pages (already had permissions)`);
}

migrate().catch(console.error);
