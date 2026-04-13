import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, 'tests/config/staging.env') });

const BASE_URL = process.env.VELDRIX_BASE_URL || 'http://localhost:5000';

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: false, // Sequential to avoid JWT session conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/reports/html', open: 'never' }],
    ['json', { outputFile: 'tests/reports/results.json' }],
    ['junit', { outputFile: 'tests/reports/junit.xml' }],
  ],

  use: {
    baseURL: BASE_URL,
    storageState: 'tests/fixtures/.auth/user.json',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
    ignoreHTTPSErrors: true,
  },

  projects: [
    // Setup: authenticate once and save session
    {
      name: 'setup',
      testMatch: /.*auth\.setup\.ts/,
      use: { storageState: undefined },
    },

    // Layer 1 — CI-blocking critical specs on Chrome
    {
      name: 'critical-chrome',
      testDir: './tests/specs/critical',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // Layer 1 — Firefox cross-browser coverage
    {
      name: 'critical-firefox',
      testDir: './tests/specs/critical',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // Layer 2 — AI agent exploratory tests (Chrome only, extended timeouts)
    {
      name: 'agent-explorer',
      testDir: './tests/specs/exploratory',
      dependencies: ['critical-chrome'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        actionTimeout: 60_000,
      },
      timeout: 300_000, // 5 min per agent test
    },
  ],

  globalSetup: './tests/fixtures/auth.fixture.ts',

  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
