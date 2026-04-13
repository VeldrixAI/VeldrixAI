/**
 * 01-auth.spec.ts — Authentication critical path
 *
 * Covers: login page rendering, invalid credentials, route guards,
 * session persistence, and logout.
 */
import { test, expect } from '@playwright/test';
import { loginViaUI, logoutViaAPI } from '../../helpers/auth.helper';
import { VELDRIX_ROUTES } from '../../config/test-users';

// ── Unauthenticated suite ────────────────────────────────────────────────────

test.describe('Login Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // no session

  test('renders the Access Portal form', async ({ page }) => {
    await page.goto(VELDRIX_ROUTES.login);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle(/Veldrix/i);
    // "Access Portal" heading in the right-panel glass card
    await expect(page.getByRole('heading', { name: /Access Portal/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('shows SSO buttons for Google and GitHub', async ({ page }) => {
    await page.goto(VELDRIX_ROUTES.login);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /Google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /GitHub/i })).toBeVisible();
  });

  test('rejects invalid credentials with an inline error', async ({ page }) => {
    await page.goto(VELDRIX_ROUTES.login);
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"]').fill('nobody@invalid.test');
    await page.locator('input[type="password"]').fill('wrong-password-xyz');
    await page.locator('button[type="submit"]').click();

    // Must stay on /login
    await expect(page).toHaveURL(/\/login/);

    // Inline error div appears (styled with rgba(244,63,94,...) background)
    const errorDiv = page.locator('text=/Invalid|incorrect|failed|wrong/i').first();
    await expect(errorDiv).toBeVisible({ timeout: 8_000 });
  });

  test('submit button shows loading spinner during request', async ({ page }) => {
    await page.goto(VELDRIX_ROUTES.login);
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"]').fill('test@veldrixai.ca');
    await page.locator('input[type="password"]').fill('password');

    const submitBtn = page.locator('button[type="submit"]');

    // Intercept so the request hangs — we observe the loading state
    await page.route('/api/auth/login', async route => {
      await new Promise(r => setTimeout(r, 300));
      await route.continue();
    });

    await submitBtn.click();
    await expect(submitBtn).toBeDisabled({ timeout: 2_000 });
  });

  test.describe('Route Guard', () => {
    const PROTECTED = [
      VELDRIX_ROUTES.dashboard,
      VELDRIX_ROUTES.evaluate,
      VELDRIX_ROUTES.apiKeys,
      VELDRIX_ROUTES.auditTrails,
    ];

    for (const route of PROTECTED) {
      test(`redirects unauthenticated user from ${route} to /login`, async ({ page }) => {
        await page.goto(route);
        await page.waitForURL(/\/login/, { timeout: 10_000 });
        expect(page.url()).toContain('/login');
      });
    }
  });
});

// ── Authenticated suite ──────────────────────────────────────────────────────

test.describe('Authenticated Session', () => {
  // storageState is injected from globalSetup via playwright.config.ts

  test('lands on /dashboard after login — not redirected', async ({ page }) => {
    await page.goto(VELDRIX_ROUTES.dashboard);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('JWT session survives a hard page reload', async ({ page }) => {
    await page.goto(VELDRIX_ROUTES.dashboard);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('logout clears session and redirects to /login', async ({ page }) => {
    await page.goto(VELDRIX_ROUTES.dashboard);
    await page.waitForLoadState('networkidle');

    // Logout button in the sidebar/header
    const logoutBtn = page.getByRole('button', { name: /logout|sign out/i })
      .or(page.getByText(/logout|sign out/i).first());
    await logoutBtn.click({ timeout: 8_000 });

    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');

    // Verify session is gone — protected route should now gate
    await page.goto(VELDRIX_ROUTES.dashboard);
    await expect(page).toHaveURL(/\/login/);
  });
});
