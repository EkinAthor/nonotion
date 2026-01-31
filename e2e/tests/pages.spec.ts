import { test, expect } from '@playwright/test';

test.describe('Page Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can create a new page', async ({ page }) => {
    // Click the "New page" button in sidebar
    await page.getByRole('button', { name: 'New page' }).click();

    // Should navigate to the new page
    await expect(page).toHaveURL(/\/page\/pg_/);

    // Should show the page header with "Untitled"
    await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  });

  test('can rename a page', async ({ page }) => {
    // Create a new page first
    await page.getByRole('button', { name: 'New page' }).click();
    await expect(page).toHaveURL(/\/page\/pg_/);

    // Click on the title to edit
    await page.getByRole('heading', { name: 'Untitled' }).click();

    // Type the new name
    await page.getByRole('textbox').fill('My Test Page');
    await page.getByRole('textbox').blur();

    // Verify the title changed
    await expect(page.getByRole('heading', { name: 'My Test Page' })).toBeVisible();

    // Verify it's updated in the sidebar
    await expect(page.locator('.text-sm').filter({ hasText: 'My Test Page' })).toBeVisible();
  });

  test('can delete a page', async ({ page }) => {
    // Create a new page
    await page.getByRole('button', { name: 'New page' }).click();
    await expect(page).toHaveURL(/\/page\/pg_/);

    // Hover over the page in sidebar to show delete button
    const pageItem = page.locator('[class*="group"]').filter({ hasText: 'Untitled' }).first();
    await pageItem.hover();

    // Click delete
    page.on('dialog', (dialog) => dialog.accept());
    await pageItem.getByTitle('Delete').click();

    // Should navigate back to home
    await expect(page).toHaveURL('/');
  });

  test('can create a sub-page', async ({ page }) => {
    // Create a parent page
    await page.getByRole('button', { name: 'New page' }).click();
    await expect(page).toHaveURL(/\/page\/pg_/);

    // Rename the parent page
    await page.getByRole('heading', { name: 'Untitled' }).click();
    await page.getByRole('textbox').fill('Parent Page');
    await page.getByRole('textbox').blur();

    // Hover over the page in sidebar and click add subpage
    const pageItem = page.locator('[class*="group"]').filter({ hasText: 'Parent Page' }).first();
    await pageItem.hover();
    await pageItem.getByTitle('Add subpage').click();

    // Should navigate to the new child page
    await expect(page).toHaveURL(/\/page\/pg_/);

    // Verify breadcrumb shows parent
    await expect(page.getByText('Parent Page').first()).toBeVisible();
  });

  test('can star/unstar a page', async ({ page }) => {
    // Create a new page
    await page.getByRole('button', { name: 'New page' }).click();
    await expect(page).toHaveURL(/\/page\/pg_/);

    // Rename it
    await page.getByRole('heading', { name: 'Untitled' }).click();
    await page.getByRole('textbox').fill('Starred Page');
    await page.getByRole('textbox').blur();

    // Click the star button
    await page.getByTitle('Add to starred').click();

    // Should now show in starred section
    await expect(page.getByText('Starred').first()).toBeVisible();

    // Unstar
    await page.getByTitle('Remove from starred').click();

    // Starred section should be gone (no starred pages)
    await expect(page.locator('.uppercase').filter({ hasText: 'Starred' })).not.toBeVisible();
  });
});
