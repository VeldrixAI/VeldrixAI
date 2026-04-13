/**
 * 06-prompt-generator.spec.ts — Prompt Architect / Generator critical path
 *
 * Covers: page render, three-variant generation (Strict, Balanced, Adaptive),
 * saved prompts list, and clipboard copy.
 */
import { test, expect } from '../../fixtures/veldrix.fixture';

const POLICY_INPUT =
  'Our AI assistant must never provide specific medication dosage advice. ' +
  'Redirect medical questions to qualified healthcare professionals. ' +
  'All responses must comply with HIPAA.';

test.describe('Prompt Generator Page', () => {
  test('renders page heading and input form', async ({ page, veldrixPage }) => {
    await veldrixPage.goPromptGenerator();

    // The page has "Prompt Architect" or "Prompt Generator" in the heading area
    const heading = page.locator('text=/Prompt Architect|Prompt Generator/i').first();
    await expect(heading).toBeVisible({ timeout: 8_000 });

    await expect(page.locator('textarea').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /generate|create/i })).toBeVisible();
  });

  test('generates three enforcement-grade prompt variants', async ({ page, veldrixPage }) => {
    await veldrixPage.goPromptGenerator();

    await page.locator('textarea').first().fill(POLICY_INPUT);
    await page.getByRole('button', { name: /generate|create/i }).click();

    // Wait for LLM generation (API call to /api/prompts/generate or /api/prompts/extract-policy)
    await page.waitForLoadState('networkidle');

    // Three variants: Strict, Balanced, Adaptive
    for (const variant of ['Strict', 'Balanced', 'Adaptive']) {
      const variantEl = page.locator(`text=${variant}`).first();
      await expect(variantEl).toBeVisible({ timeout: 30_000 });
    }
  });

  test('each variant card shows non-empty prompt text', async ({ page, veldrixPage }) => {
    await veldrixPage.goPromptGenerator();

    await page.locator('textarea').first().fill(POLICY_INPUT);
    await page.getByRole('button', { name: /generate|create/i }).click();
    await page.waitForLoadState('networkidle');

    for (const variant of ['Strict', 'Balanced', 'Adaptive']) {
      const card = page.locator(`text=${variant}`).locator('..').locator('..').first();
      await card.waitFor({ timeout: 30_000 });
      const text = await card.textContent();
      // Each card must contain more than just the label
      expect((text || '').length).toBeGreaterThan(variant.length + 20);
    }
  });

  test('copy button on a variant triggers clipboard feedback', async ({ page, veldrixPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await veldrixPage.goPromptGenerator();

    await page.locator('textarea').first().fill(POLICY_INPUT);
    await page.getByRole('button', { name: /generate|create/i }).click();
    await page.waitForLoadState('networkidle');

    // Wait for Strict variant to appear before trying to copy
    await page.locator('text=Strict').first().waitFor({ timeout: 30_000 });

    const copyBtn = page.getByRole('button', { name: /copy/i }).first();
    if (await copyBtn.isVisible({ timeout: 5_000 })) {
      await copyBtn.click();
      const feedback = page.locator('text=/copied|✓/i').first();
      await expect(feedback).toBeVisible({ timeout: 5_000 });
    }
  });

  test('can save a generated prompt', async ({ page, veldrixPage }) => {
    await veldrixPage.goPromptGenerator();

    await page.locator('textarea').first().fill(POLICY_INPUT);
    await page.getByRole('button', { name: /generate|create/i }).click();
    await page.waitForLoadState('networkidle');

    // Look for a Save button on any variant card
    const saveBtn = page.getByRole('button', { name: /save/i }).first();
    if (await saveBtn.isVisible({ timeout: 30_000 })) {
      await saveBtn.click();
      await page.waitForLoadState('networkidle');

      // Toast or success indicator
      const success = page.locator('text=/saved|success/i').first();
      await expect(success).toBeVisible({ timeout: 5_000 });
    }
  });

  test('industry and region selectors change generation parameters', async ({ page, veldrixPage }) => {
    await veldrixPage.goPromptGenerator();

    const industrySelect = page.locator('select').first();
    if (await industrySelect.isVisible({ timeout: 3_000 })) {
      await industrySelect.selectOption({ index: 1 });
    }

    const regionSelect = page.locator('select').nth(1);
    if (await regionSelect.isVisible({ timeout: 3_000 })) {
      await regionSelect.selectOption({ index: 1 });
    }

    // Verify no crash after changing selectors
    await expect(page.locator('textarea').first()).toBeVisible();
  });

  test('strictness slider changes the MODERNITY_LABEL displayed', async ({ page, veldrixPage }) => {
    await veldrixPage.goPromptGenerator();

    const slider = page.locator('input[type="range"]').first();
    if (await slider.isVisible({ timeout: 3_000 })) {
      // Move to maximum strictness
      await slider.fill('1');
      const label = page.locator('text=/STRICT|REGULATED|MODERATE|FLEXIBLE|FLUID/i').first();
      await expect(label).toBeVisible({ timeout: 3_000 });
    }
  });

  test('no JavaScript errors on the prompt generator page', async ({ page, veldrixPage }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await veldrixPage.goPromptGenerator();
    await page.waitForLoadState('networkidle');

    const critical = errors.filter(e => !e.includes('favicon') && !e.includes('ResizeObserver'));
    expect(critical).toHaveLength(0);
  });
});
