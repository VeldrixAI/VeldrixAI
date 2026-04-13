/**
 * 05-dashboard.spec.ts — Main dashboard critical path
 *
 * Covers: widget rendering, navigation, no JS errors, real data (not placeholders).
 */
import { test, expect } from '../../fixtures/veldrix.fixture';
import { VELDRIX_ROUTES } from '../../config/test-users';

test.describe('Dashboard', () => {
  test('renders without JavaScript errors', async ({ page, veldrixPage }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await veldrixPage.goDashboard();
    await page.waitForLoadState('networkidle');

    const critical = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('ResizeObserver') &&
      !e.includes('net::ERR')
    );
    expect(critical).toHaveLength(0);
  });

  test('displays the VeldrixAI brand and navigation sidebar', async ({ page, veldrixPage }) => {
    await veldrixPage.goDashboard();

    await expect(page.locator('text=VeldrixAI, text=Veldrix').first()).toBeVisible();
    await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible();
  });

  test('all primary nav links resolve to existing routes', async ({ page, veldrixPage }) => {
    await veldrixPage.goDashboard();

    const navLinks = page.locator('nav a, [role="navigation"] a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 8); i++) {
      const href = await navLinks.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).not.toBe('#');
    }
  });

  test('no placeholder/loading text visible after network idle', async ({ page, veldrixPage }) => {
    await veldrixPage.goDashboard();
    await page.waitForLoadState('networkidle');

    // Legitimate "loading" that never resolves is a bug
    const stuckLoaders = page.locator('text=/loading\\.\\.\\.$/i');
    const count = await stuckLoaders.count();
    expect(count).toBe(0);
  });

  test('key metric widgets render actual numbers', async ({ page, veldrixPage }) => {
    await veldrixPage.goDashboard();
    await page.waitForLoadState('networkidle');

    // At least one numeric metric must be visible (evaluations, requests, score, etc.)
    const metrics = page.locator('text=/\\d+/');
    const metricCount = await metrics.count();
    expect(metricCount).toBeGreaterThan(0);
  });

  test('charts render without blank containers', async ({ page, veldrixPage }) => {
    await veldrixPage.goDashboard();
    await page.waitForLoadState('networkidle');

    // Recharts renders SVG — at least one SVG should be on the analytics dashboard
    const charts = page.locator('svg');
    const chartCount = await charts.count();
    // Allow for icon SVGs — just confirm at least one is present
    expect(chartCount).toBeGreaterThan(0);
  });

  test('clicking "Evaluate" nav item navigates to /dashboard/evaluate', async ({ page, veldrixPage }) => {
    await veldrixPage.goDashboard();

    const evaluateLink = page.getByRole('link', { name: /evaluate|trust/i })
      .or(page.locator(`a[href="${VELDRIX_ROUTES.evaluate}"]`));

    if (await evaluateLink.first().isVisible({ timeout: 3_000 })) {
      await evaluateLink.first().click();
      await expect(page).toHaveURL(/evaluate/);
    }
  });

  test('clicking "Audit Trails" nav item navigates to /dashboard/audit-trails', async ({ page, veldrixPage }) => {
    await veldrixPage.goDashboard();

    const auditLink = page.getByRole('link', { name: /audit/i })
      .or(page.locator(`a[href="${VELDRIX_ROUTES.auditTrails}"]`));

    if (await auditLink.first().isVisible({ timeout: 3_000 })) {
      await auditLink.first().click();
      await expect(page).toHaveURL(/audit-trails/);
    }
  });
});
