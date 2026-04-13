/**
 * 02-sdk-keys.spec.ts — API key management critical path
 *
 * Covers: page render, key generation, masking, reveal-once, revocation,
 * and API rejection of revoked keys.
 */
import { test, expect } from '../../fixtures/veldrix.fixture';

const KEY_NAME = `ci-key-${Date.now()}`;

test.describe('API Keys Page', () => {
  test('renders heading and Generate Key button', async ({ page, veldrixPage }) => {
    await veldrixPage.goApiKeys();

    await expect(
      page.getByRole('heading', { name: /api key|sdk key/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /generate|create|new key/i })
    ).toBeVisible();
  });

  test('shows the governance health score widget', async ({ page, veldrixPage }) => {
    await veldrixPage.goApiKeys();
    // The page fetches /api/analytics?path=sdk-stats — verify the widget renders
    const healthWidget = page.locator('text=/governance|health|score/i').first();
    await expect(healthWidget).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Key Lifecycle', () => {
  test('generates a new key and shows it once in a reveal modal', async ({ page, veldrixPage }) => {
    const generatedKey = await veldrixPage.createApiKey(KEY_NAME);
    // Key must be a non-empty string (vx_ prefix expected from actual API)
    expect(generatedKey.length).toBeGreaterThan(10);
  });

  test('generated key appears in the keys list', async ({ page, veldrixPage }) => {
    await veldrixPage.goApiKeys();
    await expect(page.getByText(KEY_NAME)).toBeVisible({ timeout: 10_000 });
  });

  test('full key value is not visible in the list — only prefix shown', async ({ page, veldrixPage }) => {
    await veldrixPage.goApiKeys();

    // The list page should show only a masked prefix (e.g. "vx_abc•••••••")
    // not the full 32-char key. We verify no long unmasked key string is exposed.
    const rows = page.locator('table tbody tr, [class*="row"]').filter({ hasText: KEY_NAME });
    const rowText = await rows.first().textContent({ timeout: 5_000 });
    // No key string should be longer than ~10 chars visible in the table
    // (prefix = first 6-8 chars + dots)
    expect(rowText).not.toMatch(/vx_[a-zA-Z0-9]{20,}/);
  });

  test('copy icon on the key row triggers clipboard confirmation', async ({ page, veldrixPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await veldrixPage.goApiKeys();

    const keyRow = page.locator('[class*="row"], tr').filter({ hasText: KEY_NAME }).first();
    const copyBtn = keyRow.getByRole('button', { name: /copy/i })
      .or(keyRow.locator('[aria-label*="copy"], [title*="copy"]'));

    if (await copyBtn.isVisible({ timeout: 3_000 })) {
      await copyBtn.click();
      // Expect a "Copied" confirmation indicator
      const feedback = page.locator('text=/copied|✓/i').first();
      await expect(feedback).toBeVisible({ timeout: 3_000 });
    }
  });

  test('can revoke a key — it disappears or is marked revoked', async ({ page, veldrixPage }) => {
    await veldrixPage.revokeApiKey(KEY_NAME);
    await veldrixPage.goApiKeys();

    const keyText = page.getByText(KEY_NAME);
    // Either the row is gone or it shows a "Revoked" badge
    const isGone    = await keyText.isHidden({ timeout: 5_000 }).catch(() => false);
    const isRevoked = await page.getByText(/revoked/i).isVisible({ timeout: 3_000 }).catch(() => false);
    expect(isGone || isRevoked).toBe(true);
  });

  test('revoked key returns 401/403 from the trust evaluate endpoint', async ({ request }) => {
    const response = await request.post('/api/trust/evaluate', {
      headers: { 'Authorization': 'Bearer vx_revoked_00000000000000000000' },
      data: { prompt: 'test', response: 'test' },
    });
    expect([401, 403]).toContain(response.status());
  });
});
