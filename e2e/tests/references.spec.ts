import { test, expect, type Page as PwPage, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001/api';

// One API login per worker (the auth rate-limit tier is 10 req/15min —
// per-test UI logins would exhaust it). The browser session is established
// by injecting the token into the persisted auth store.
let cachedAuth: { token: string; user: unknown } | null = null;

async function apiLogin(request: APIRequestContext): Promise<{ token: string; user: unknown }> {
  if (cachedAuth) return cachedAuth;
  const res = await request.post(`${API}/auth/login`, {
    data: { email: 'admin@example.com', password: 'adminadmin' },
  });
  expect(res.ok(), `login failed: ${res.status()} ${await res.text()}`).toBe(true);
  const body = await res.json();
  cachedAuth = { token: body.data.token as string, user: body.data.user };
  return cachedAuth;
}

/** Authenticate the browser context by seeding the persisted auth store. */
async function loginAsAdmin(page: PwPage, auth: { token: string; user: unknown }) {
  await page.addInitScript((persisted) => {
    localStorage.setItem('nonotion-auth', persisted);
  }, JSON.stringify({ state: { token: auth.token, user: auth.user }, version: 0 }));
}

interface Seeded {
  sourceDbId: string;
  sourceRowId: string;
  targetTitle: string;
}

/**
 * Seed via API (UI would be far too slow): a target database with 120 rows,
 * a source database with a reference property pointing at it, and one source
 * row referencing target row #110 — beyond the first 100 rows, which is the
 * regression this spec guards (reference names must resolve by id, not from
 * a first-N-rows fetch).
 */
async function seedReferenceFixture(request: APIRequestContext): Promise<Seeded> {
  const { token } = await apiLogin(request);
  const headers = { Authorization: `Bearer ${token}` };
  const stamp = Date.now().toString(36);

  const post = async (path: string, data: unknown) => {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} failed: ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()).data;
  };

  const targetDb = await post('/pages', { title: `Ref Targets ${stamp}`, type: 'database' });
  const sourceDb = await post('/pages', { title: `Ref Source ${stamp}`, type: 'database' });

  // 120 target rows, created in order (small concurrent chunks for speed)
  const targetIds: string[] = [];
  for (let start = 1; start <= 120; start += 20) {
    const chunk = await Promise.all(
      Array.from({ length: Math.min(20, 121 - start) }, (_, i) =>
        post('/pages', {
          title: `Target ${String(start + i).padStart(3, '0')}`,
          parentId: targetDb.id,
        })
      )
    );
    targetIds.push(...chunk.map((p: { id: string }) => p.id));
  }

  // Add the reference property on the source database
  const patched = await request.patch(`${API}/pages/${sourceDb.id}/schema`, {
    headers,
    data: {
      addProperties: [
        { name: 'Related', type: 'reference', referencedDatabaseId: targetDb.id },
      ],
    },
  });
  expect(patched.ok()).toBe(true);
  const schema = (await patched.json()).data.databaseSchema;
  const refProp = schema.properties.find(
    (p: { type: string }) => p.type === 'reference'
  );

  // One source row referencing target #110 (index >= 100)
  const targetIdx = 109;
  const sourceRow = await post('/pages', {
    title: 'Row referencing 110',
    parentId: sourceDb.id,
    properties: {
      [refProp.id]: { type: 'reference', value: [targetIds[targetIdx]] },
    },
  });

  return {
    sourceDbId: sourceDb.id,
    sourceRowId: sourceRow.id,
    targetTitle: 'Target 110',
  };
}

test.describe('Reference name resolution beyond 100 rows', () => {
  let seeded: Seeded;

  test.beforeEach(async ({ page, request }) => {
    seeded = await seedReferenceFixture(request);
    await loginAsAdmin(page, await apiLogin(request));
  });

  test('row page detail shows the referenced title, not "Untitled"', async ({ page }) => {
    await page.goto(`/page/${seeded.sourceRowId}`);

    const relatedRow = page
      .locator('div.flex.items-start', { has: page.getByText('Related', { exact: true }) })
      .first();
    await expect(relatedRow.getByText(seeded.targetTitle)).toBeVisible();
    await expect(relatedRow.getByText('Untitled')).toHaveCount(0);
  });

  test('filter chip shows the referenced title after popover reopen, never the raw id', async ({
    page,
  }) => {
    await page.goto(`/page/${seeded.sourceDbId}`);
    await expect(page.locator('table')).toBeVisible();

    // Add a reference filter for the target row
    await page.getByRole('button', { name: /Filter/i }).click();
    const recordsInput = page.getByPlaceholder('Select records...');
    await recordsInput.click();
    await recordsInput.fill(seeded.targetTitle);
    await page
      .locator('label', { hasText: seeded.targetTitle })
      .locator('input[type=checkbox]')
      .check();
    await page.keyboard.press('Escape');

    // Reopen the popover — the chip must resolve to the title (not a pg_ id)
    await page.getByRole('button', { name: /Filter/i }).click();
    const popover = page.locator('div.fixed', { hasText: 'Filter by properties' });
    await expect(popover.getByText(seeded.targetTitle).first()).toBeVisible();
    await expect(popover.getByText(/pg_[a-z0-9]+/)).toHaveCount(0);
  });
});
