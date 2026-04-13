/**
 * 07-reports.spec.ts — Reports page critical path
 *
 * Covers: page render, report list, PDF generation trigger,
 * and no JS errors.
 */
import { test, expect } from '../../fixtures/veldrix.fixture';

test.describe('Reports Page', () => {
  test('renders page heading', async ({ page, veldrixPage }) => {
    await veldrixPage.goReports();

    const heading = page.locator('text=/Report|Governance Report/i').first();
    await expect(heading).toBeVisible({ timeout: 8_000 });
  });

  test('shows a list of generated reports or an empty state', async ({ page, veldrixPage }) => {
    await veldrixPage.goReports();
    await page.waitForLoadState('networkidle');

    const hasReports = await page.locator('table tbody tr, [class*="report-row"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmptyState = await page.locator('text=/no reports|empty|get started/i').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasReports || hasEmptyState).toBe(true);
  });

  test('PDF download button is present when reports exist', async ({ page, veldrixPage }) => {
    await veldrixPage.goReports();
    await page.waitForLoadState('networkidle');

    const hasRows = await page.locator('table tbody tr').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasRows) {
      const pdfBtn = page.getByRole('button', { name: /pdf|download|export/i }).first()
        .or(page.locator('[aria-label*="pdf" i]').first());
      await expect(pdfBtn).toBeVisible({ timeout: 5_000 });
    }
  });

  test('no JavaScript errors on reports page', async ({ page, veldrixPage }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await veldrixPage.goReports();
    await page.waitForLoadState('networkidle');

    const critical = errors.filter(e => !e.includes('favicon') && !e.includes('ResizeObserver'));
    expect(critical).toHaveLength(0);
  });
});
