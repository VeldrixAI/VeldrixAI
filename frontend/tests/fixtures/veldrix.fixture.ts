/**
 * VeldrixAI domain fixtures — wraps common navigation and interactions
 * so specs stay declarative. Selectors are derived from the actual
 * Next.js App Router pages (no data-testid attributes exist yet).
 */
import { test as base, Page } from '@playwright/test';
import { VELDRIX_ROUTES, PromptVariant } from '../config/test-users';

// ── Page Object ───────────────────────────────────────────────────────────────

export class VeldrixPage {
  constructor(public readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────────────────────

  async goDashboard()       { await this.page.goto(VELDRIX_ROUTES.dashboard);       await this.waitForApp(); }
  async goEvaluate()        { await this.page.goto(VELDRIX_ROUTES.evaluate);        await this.waitForApp(); }
  async goApiKeys()         { await this.page.goto(VELDRIX_ROUTES.apiKeys);         await this.waitForApp(); }
  async goAuditTrails()     { await this.page.goto(VELDRIX_ROUTES.auditTrails);     await this.waitForApp(); }
  async goPromptGenerator() { await this.page.goto(VELDRIX_ROUTES.promptGenerator); await this.waitForApp(); }
  async goReports()         { await this.page.goto(VELDRIX_ROUTES.reports);         await this.waitForApp(); }
  async goSDK()             { await this.page.goto(VELDRIX_ROUTES.sdk);             await this.waitForApp(); }

  /** Wait for the Next.js App Router shell + main content to hydrate */
  async waitForApp() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForSelector('main, [role="main"], #__next', { timeout: 15_000 });
  }

  // ── Authentication ───────────────────────────────────────────────────────────

  /** Logs out by calling the /api/auth/logout endpoint directly */
  async logout() {
    await this.page.request.post('/api/auth/logout');
    await this.page.goto(VELDRIX_ROUTES.login);
    await this.waitForApp();
  }

  // ── Trust Evaluation ─────────────────────────────────────────────────────────

  /**
   * Submits a trust evaluation via the UI evaluate form.
   * Returns after the result is rendered.
   */
  async submitEvaluation(params: {
    prompt: string;
    response: string;
    model?: string;
  }) {
    await this.goEvaluate();

    const promptField = this.page.locator('textarea').first();
    await promptField.fill(params.prompt);

    // Find response textarea (second textarea or labelled one)
    const textareas = this.page.locator('textarea');
    const count = await textareas.count();
    if (count > 1) {
      await textareas.nth(1).fill(params.response);
    }

    // Model selector (if present)
    if (params.model) {
      const modelSelect = this.page.locator('select').first();
      if (await modelSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await modelSelect.selectOption({ label: params.model }).catch(() => {});
      }
    }

    // Submit
    await this.page.getByRole('button', { name: /evaluate|analyze|run/i }).click();
    await this.page.waitForLoadState('networkidle');
  }

  // ── API Key Management ───────────────────────────────────────────────────────

  /**
   * Generates a new API key via the dashboard UI.
   * Returns the key value shown in the one-time reveal modal.
   */
  async createApiKey(name: string): Promise<string> {
    await this.goApiKeys();

    // Open create modal
    await this.page.getByRole('button', { name: /generate|create|new key/i }).click();

    // Fill key name in modal
    const nameInput = this.page.locator('input[placeholder*="name"], input[type="text"]').first();
    if (await nameInput.isVisible({ timeout: 3_000 })) {
      await nameInput.fill(name);
    }

    // Confirm generation
    await this.page.getByRole('button', { name: /generate|create|confirm/i }).last().click();

    // Capture the one-time key reveal (shown in a code/pre/input element)
    const keyEl = this.page.locator('code, pre, input[readonly]').filter({ hasText: /vx_|sk_/ }).first();
    const key = await keyEl.textContent({ timeout: 10_000 }).catch(() => '');
    return (key || '').trim();
  }

  /** Revokes an API key by name from the keys list */
  async revokeApiKey(keyName: string) {
    await this.goApiKeys();
    const row = this.page.locator('[class*="row"], tr, li').filter({ hasText: keyName }).first();
    await row.getByRole('button', { name: /revoke|delete/i }).click();

    // Confirm revocation
    const confirmBtn = this.page.getByRole('button', { name: /confirm|revoke|yes/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 })) {
      await confirmBtn.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  // ── Prompt Generator ─────────────────────────────────────────────────────────

  /**
   * Generates prompt templates from the Prompt Generator page.
   * Returns the text of the requested variant.
   */
  async generatePrompts(instruction: string, variant: PromptVariant = 'Balanced'): Promise<string> {
    await this.goPromptGenerator();

    // Fill the base instruction / policy context
    const textInput = this.page.locator('textarea').first();
    await textInput.fill(instruction);

    await this.page.getByRole('button', { name: /generate|create/i }).click();
    await this.page.waitForLoadState('networkidle');

    // Return the text of the requested variant card
    const variantCard = this.page.locator(`text=${variant}`).locator('..').locator('..');
    return (await variantCard.textContent({ timeout: 30_000 })) || '';
  }

  // ── Audit Trails ────────────────────────────────────────────────────────────

  /** Returns the text content of the first audit entry row */
  async getFirstAuditEntry(): Promise<string> {
    await this.goAuditTrails();
    const firstRow = this.page.locator('table tbody tr, [class*="row"]').first();
    await firstRow.waitFor({ timeout: 10_000 });
    return (await firstRow.textContent()) || '';
  }
}

// ── Extended test fixture ────────────────────────────────────────────────────

type VeldrixFixtures = { veldrixPage: VeldrixPage };

export const test = base.extend<VeldrixFixtures>({
  veldrixPage: async ({ page }, use) => {
    await use(new VeldrixPage(page));
  },
});

export { expect } from '@playwright/test';
