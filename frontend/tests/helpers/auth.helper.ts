import { Page } from '@playwright/test';
import { TEST_USERS, VELDRIX_ROUTES } from '../config/test-users';

/**
 * Performs a full UI login using the actual email/password form.
 * Prefer the globalSetup storageState for most tests — use this only
 * when you need a fresh unauthenticated → authenticated flow in a spec.
 */
export async function loginViaUI(
  page: Page,
  credentials = TEST_USERS.admin
): Promise<void> {
  await page.goto(VELDRIX_ROUTES.login);
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(url => !url.toString().includes('/login'), {
    timeout: 15_000,
  });
}

/**
 * Logs out by POST-ing to the logout API and verifying the redirect.
 */
export async function logoutViaAPI(page: Page): Promise<void> {
  await page.request.post('/api/auth/logout');
  await page.goto(VELDRIX_ROUTES.login);
}
