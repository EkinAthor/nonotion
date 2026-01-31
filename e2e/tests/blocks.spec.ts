import { test, expect } from '@playwright/test';

test.describe('Block Editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Create a new page for each test
    await page.getByRole('button', { name: 'New page' }).click();
    await expect(page).toHaveURL(/\/page\/pg_/);
  });

  test('can add a heading block', async ({ page }) => {
    // Click "Add a block" button
    await page.getByRole('button', { name: 'Add a block' }).click();

    // Select Heading 1
    await page.getByText('Heading 1').click();

    // Type in the heading
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.type('My Heading');

    // Verify the heading is visible
    await expect(page.getByText('My Heading')).toBeVisible();
  });

  test('can add a paragraph block', async ({ page }) => {
    // Click "Add a block" button
    await page.getByRole('button', { name: 'Add a block' }).click();

    // Select Paragraph
    await page.getByText('Paragraph').click();

    // Type in the paragraph
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.type('This is a test paragraph.');

    // Verify the paragraph is visible
    await expect(page.getByText('This is a test paragraph.')).toBeVisible();
  });

  test('can edit block content', async ({ page }) => {
    // Add a paragraph block
    await page.getByRole('button', { name: 'Add a block' }).click();
    await page.getByText('Paragraph').click();

    // Type initial content
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.type('Initial content');

    // Wait a moment for autosave
    await page.waitForTimeout(600);

    // Clear and type new content
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Updated content');

    // Verify the updated content
    await expect(page.getByText('Updated content')).toBeVisible();
  });

  test('can delete a block', async ({ page }) => {
    // Add a paragraph block
    await page.getByRole('button', { name: 'Add a block' }).click();
    await page.getByText('Paragraph').click();

    // Type content
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.type('Block to delete');
    await page.waitForTimeout(600);

    // Hover over the block to show delete button
    const blockWrapper = page.locator('.group').filter({ hasText: 'Block to delete' }).first();
    await blockWrapper.hover();

    // Click delete
    await blockWrapper.getByTitle('Delete block').click();

    // Verify block is gone
    await expect(page.getByText('Block to delete')).not.toBeVisible();
  });

  test('block content persists after refresh', async ({ page }) => {
    // Add a heading block
    await page.getByRole('button', { name: 'Add a block' }).click();
    await page.getByText('Heading 1').click();
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.type('Persistent Heading');

    // Wait for autosave
    await page.waitForTimeout(700);

    // Get the current URL
    const url = page.url();

    // Refresh the page
    await page.reload();

    // Verify content persists
    await expect(page.getByText('Persistent Heading')).toBeVisible();
  });
});
