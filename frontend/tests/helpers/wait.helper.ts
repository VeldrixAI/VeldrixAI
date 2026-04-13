import { Page } from '@playwright/test';

/**
 * Waits for the VeldrixAI trust evaluation result to finish rendering.
 * The five-pillar asyncio.gather() typically resolves in 2–8 seconds.
 */
export async function waitForEvaluationResult(page: Page, timeout = 30_000): Promise<void> {
  // Evaluation result container — matches the TrustResponse display in evaluate/page.tsx
  await page.locator(
    '[class*="pillar"], [class*="score"], [class*="result"], text=/\\/100|Risk Level/i'
  ).first().waitFor({ state: 'visible', timeout });
}

/**
 * Intercepts and returns the first API response matching the URL pattern.
 * Useful for capturing evaluation payloads without scraping the DOM.
 */
export async function waitForAPIResponse(
  page: Page,
  urlPattern: string | RegExp,
  options: { method?: string; timeout?: number } = {}
) {
  const response = await page.waitForResponse(
    res => {
      const urlMatch = typeof urlPattern === 'string'
        ? res.url().includes(urlPattern)
        : urlPattern.test(res.url());
      const methodMatch = options.method ? res.request().method() === options.method : true;
      return urlMatch && methodMatch;
    },
    { timeout: options.timeout || 15_000 }
  );

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
    url: response.url(),
  };
}

/**
 * Polls a predicate until it returns true or the timeout expires.
 * Used in agent verification loops.
 */
export async function pollUntil(
  fn: () => Promise<boolean>,
  options: { interval?: number; timeout?: number; message?: string } = {}
): Promise<void> {
  const { interval = 500, timeout = 10_000, message = 'Condition not met' } = options;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Timeout (${timeout}ms): ${message}`);
}

/**
 * Dismisses any visible toast/notification so it doesn't block subsequent clicks.
 */
export async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.locator('[class*="toast"], [role="status"], [role="alert"]');
  const count = await toasts.count();
  for (let i = 0; i < count; i++) {
    const close = toasts.nth(i).getByRole('button', { name: /close|dismiss|×/i });
    if (await close.isVisible({ timeout: 500 }).catch(() => false)) {
      await close.click().catch(() => {});
    }
  }
}
