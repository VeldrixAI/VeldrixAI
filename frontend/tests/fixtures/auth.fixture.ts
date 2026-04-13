/**
 * Global Playwright setup — authenticates once and persists the
 * `veldrix_session` httpOnly cookie (sameSite: lax) so all specs
 * reuse the session without re-logging in on every test.
 */
import { chromium, FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../config/staging.env') });

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

async function globalSetup(config: FullConfig) {
  fs.mkdirSync(path.join(__dirname, '.auth'), { recursive: true });

  const email    = process.env.VELDRIX_TEST_EMAIL;
  const password = process.env.VELDRIX_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      '[Auth Setup] VELDRIX_TEST_EMAIL and VELDRIX_TEST_PASSWORD must be set. ' +
      'Copy tests/config/staging.env to .env.test and fill in credentials.'
    );
  }

  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5000';
  console.log(`[Auth Setup] Authenticating at ${baseURL}/login as ${email}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page    = await context.newPage();

  await page.goto(`${baseURL}/login`);
  await page.waitForLoadState('networkidle');

  // Login form uses plain semantic inputs — no data-testid needed
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for successful redirect off the login page
  await page.waitForURL(url => !url.toString().includes('/login'), {
    timeout: 20_000,
  });

  console.log(`[Auth Setup] Redirected to: ${page.url()}`);

  // Persist session — captures the veldrix_session cookie
  await context.storageState({ path: AUTH_FILE });
  console.log(`[Auth Setup] Session saved to ${AUTH_FILE}`);

  await browser.close();
}

export default globalSetup;
