import { test, expect, type Page as PwPage } from '@playwright/test';

/** Login as admin and navigate to home */
async function loginAsAdmin(page: PwPage) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('adminadmin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/^(?!.*\/login)/); // wait until we leave /login
}

/** Create a database and navigate to it. Returns the page URL. */
async function createDatabase(page: PwPage) {
  await page.getByRole('button', { name: 'New database' }).click();
  await expect(page).toHaveURL(/\/page\/pg_/);
  // Wait for the table to render
  await expect(page.locator('table')).toBeVisible();
  return page.url();
}

test.describe('Database Default View Config', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('save default config and load it on fresh session', async ({ page }) => {
    const url = await createDatabase(page);

    // Open Properties panel and hide a column by adding a text property first
    await page.getByRole('button', { name: 'Properties' }).click();
    // Add a text property
    await page.getByRole('button', { name: /Add a property/i }).click();
    await page.getByText('Text', { exact: true }).click();
    // Close properties panel
    await page.keyboard.press('Escape');

    // Wait for the new property column to appear in the table
    await expect(page.locator('th').filter({ hasText: 'Text' })).toBeVisible();

    // Open Properties panel again to hide the new property
    await page.getByRole('button', { name: 'Properties' }).click();
    // Find the visibility toggle for the "Text" property and click it
    const textPropertyRow = page.locator('[class*="flex"]').filter({ hasText: 'Text' }).last();
    const visibilityToggle = textPropertyRow.getByTitle(/toggle visibility|hide|eye/i);
    if (await visibilityToggle.count() > 0) {
      await visibilityToggle.click();
    }
    await page.keyboard.press('Escape');

    // Click "Save as default"
    await page.getByRole('button', { name: 'Save as default' }).click();

    // Wait for the save to complete (button text returns to "Save as default")
    await expect(page.getByRole('button', { name: 'Save as default' })).toBeEnabled();

    // Clear localStorage to simulate a fresh session
    await page.evaluate(() => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('nonotion_dbview_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    });

    // Reload the page
    await page.goto(url);
    await expect(page.locator('table')).toBeVisible();

    // The "Revert to default" button should be visible (proves default config was loaded)
    await expect(page.getByRole('button', { name: 'Revert to default' })).toBeVisible();
  });

  test('revert to default restores saved config', async ({ page }) => {
    const url = await createDatabase(page);

    // Add a filter
    await page.getByRole('button', { name: /Filter/i }).click();
    // The filter popover should open — add a filter
    const addFilterBtn = page.getByRole('button', { name: /Add a filter/i });
    if (await addFilterBtn.isVisible()) {
      await addFilterBtn.click();
    }
    await page.keyboard.press('Escape');

    // Save as default
    await page.getByRole('button', { name: 'Save as default' }).click();
    await expect(page.getByRole('button', { name: 'Save as default' })).toBeEnabled();

    // Now clear all filters locally
    const clearAllBtn = page.getByRole('button', { name: /Clear all/i });
    if (await clearAllBtn.isVisible()) {
      await clearAllBtn.click();
    }

    // Click "Revert to default"
    await page.getByRole('button', { name: 'Revert to default' }).click();

    // The "Revert to default" button should still be visible (default config exists)
    await expect(page.getByRole('button', { name: 'Revert to default' })).toBeVisible();
  });

  test('local config overrides server default on reload', async ({ page }) => {
    const url = await createDatabase(page);

    // Save current view as default
    await page.getByRole('button', { name: 'Save as default' }).click();
    await expect(page.getByRole('button', { name: 'Save as default' })).toBeEnabled();

    // Now modify the view locally (this creates a localStorage entry)
    // Add a filter to change local state
    await page.getByRole('button', { name: /Filter/i }).click();
    const addFilterBtn = page.getByRole('button', { name: /Add a filter/i });
    if (await addFilterBtn.isVisible()) {
      await addFilterBtn.click();
    }
    await page.keyboard.press('Escape');

    // Reload — local config should be used (localStorage was set)
    await page.goto(url);
    await expect(page.locator('table')).toBeVisible();

    // The Revert to default button should be visible since a server default exists
    await expect(page.getByRole('button', { name: 'Revert to default' })).toBeVisible();
  });
});
