import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can navigate between pages', async ({ page }) => {
    // Create first page
    await page.getByRole('button', { name: 'New page' }).click();
    await page.getByRole('heading', { name: 'Untitled' }).click();
    await page.getByRole('textbox').fill('Page One');
    await page.getByRole('textbox').blur();

    // Create second page
    await page.getByRole('button', { name: 'New page' }).click();
    await page.getByRole('heading', { name: 'Untitled' }).click();
    await page.getByRole('textbox').fill('Page Two');
    await page.getByRole('textbox').blur();

    // Click on Page One in sidebar
    await page.locator('.text-sm').filter({ hasText: 'Page One' }).click();
    await expect(page.getByRole('heading', { name: 'Page One' })).toBeVisible();

    // Click on Page Two in sidebar
    await page.locator('.text-sm').filter({ hasText: 'Page Two' }).click();
    await expect(page.getByRole('heading', { name: 'Page Two' })).toBeVisible();
  });

  test('breadcrumb navigation works', async ({ page }) => {
    // Create parent page
    await page.getByRole('button', { name: 'New page' }).click();
    await page.getByRole('heading', { name: 'Untitled' }).click();
    await page.getByRole('textbox').fill('Parent');
    await page.getByRole('textbox').blur();

    // Create child page
    const parentItem = page.locator('[class*="group"]').filter({ hasText: 'Parent' }).first();
    await parentItem.hover();
    await parentItem.getByTitle('Add subpage').click();

    await page.getByRole('heading', { name: 'Untitled' }).click();
    await page.getByRole('textbox').fill('Child');
    await page.getByRole('textbox').blur();

    // Verify breadcrumb shows parent
    await expect(page.locator('nav').getByText('Parent')).toBeVisible();

    // Click parent in breadcrumb
    await page.locator('nav').getByText('Parent').click();

    // Should navigate to parent
    await expect(page.getByRole('heading', { name: 'Parent' })).toBeVisible();
  });

  test('can reorder blocks via drag and drop', async ({ page }) => {
    // Create a page
    await page.getByRole('button', { name: 'New page' }).click();

    // Add first block
    await page.getByRole('button', { name: 'Add a block' }).click();
    await page.getByText('Heading 1').click();
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.type('First');
    await page.waitForTimeout(600);

    // Add second block
    await page.getByRole('button', { name: 'Add a block' }).click();
    await page.getByText('Paragraph').click();
    await page.locator('.ProseMirror').last().click();
    await page.keyboard.type('Second');
    await page.waitForTimeout(600);

    // Get the blocks
    const blocks = page.locator('.group').filter({ has: page.locator('.ProseMirror') });

    // Verify initial order
    const firstBlock = blocks.first();
    await expect(firstBlock).toContainText('First');

    // Perform drag and drop
    const dragHandle = firstBlock.getByTitle('Drag to reorder');
    await dragHandle.hover();

    const secondBlock = blocks.last();
    await dragHandle.dragTo(secondBlock, { targetPosition: { x: 10, y: 50 } });

    // Wait for reorder
    await page.waitForTimeout(500);

    // Verify new order (Second should now be first)
    await expect(blocks.first()).toContainText('Second');
  });

  test('block order persists after refresh', async ({ page }) => {
    // Create a page
    await page.getByRole('button', { name: 'New page' }).click();

    // Add blocks
    await page.getByRole('button', { name: 'Add a block' }).click();
    await page.getByText('Heading 1').click();
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.type('Block A');
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Add a block' }).click();
    await page.getByText('Paragraph').click();
    await page.locator('.ProseMirror').last().click();
    await page.keyboard.type('Block B');
    await page.waitForTimeout(600);

    // Get the URL
    const url = page.url();

    // Refresh
    await page.reload();

    // Verify order persists
    const blocks = page.locator('.group').filter({ has: page.locator('.ProseMirror') });
    await expect(blocks.first()).toContainText('Block A');
    await expect(blocks.last()).toContainText('Block B');
  });
});
