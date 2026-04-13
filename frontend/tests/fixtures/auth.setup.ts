/**
 * auth.setup.ts — Playwright "setup" project entry point.
 * Runs as its own project before any critical specs so the
 * authenticated storageState file exists for all other tests.
 *
 * This file is intentionally thin — the real work is in auth.fixture.ts
 * (globalSetup). This spec just re-validates the session is usable.
 */
import { test, expect } from '@playwright/test';
import { VELDRIX_ROUTES } from '../config/test-users';

test('authenticated session is valid', async ({ page }) => {
  // storageState is undefined for the setup project — globalSetup already ran.
  // This just confirms the session cookie was persisted correctly by visiting
  // a protected route and checking we don't get bounced to /login.
  await page.goto(VELDRIX_ROUTES.dashboard);
  await page.waitForLoadState('networkidle');
  await expect(page).not.toHaveURL(/\/login/);
});
