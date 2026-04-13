/**
 * agent-explorer.spec.ts — Layer 2: AI-driven exploratory test
 *
 * This spec is intentionally minimal on the Playwright side —
 * the heavy lifting is done by VeldrixTestAgent which drives the
 * browser via the Anthropic SDK + @playwright/mcp.
 *
 * Runs after all Layer 1 critical specs pass (see playwright.config.ts).
 * Reports agent findings as artefacts; failures here are non-gating
 * by default but surface as Jenkins warnings.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const REPORTS_DIR = path.join(process.cwd(), 'tests/reports');

test.describe('AI Agent — Exploratory Test Suite', () => {
  test.setTimeout(300_000); // 5 minutes for full agent run

  test('agent runs all coverage areas and produces a final report', async () => {
    // The agent is invoked as a child process so it can use its own
    // event loop and manage MCP connections independently.
    const { execSync } = await import('child_process');

    let exitCode = 0;
    try {
      execSync(
        'npx tsx tests/agent/veldrix-test-agent.ts',
        {
          cwd: process.cwd(),
          stdio: 'inherit',
          timeout: 280_000,
          env: {
            ...process.env,
            PLAYWRIGHT_MCP_URL: process.env.PLAYWRIGHT_MCP_URL || 'http://localhost:8931/sse',
          },
        }
      );
    } catch (err: unknown) {
      exitCode = (err as { status?: number }).status ?? 1;
    }

    // Final report must exist regardless of pass/fail
    const reportPath = path.join(REPORTS_DIR, 'agent-final.json');
    expect(fs.existsSync(reportPath)).toBe(true);

    if (!fs.existsSync(reportPath)) return;

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

    // Log summary to Playwright report
    console.log(`[Agent Explorer] Pass: ${report.totals?.pass}  Fail: ${report.totals?.fail}  Anomaly: ${report.totals?.anomaly}`);

    // Surface blocking failures as test failures — non-blocking areas are warnings only
    if (report.hasBlockingFailures) {
      const blockingFails = report.areas
        .filter((a: { blocked: boolean; area: string }) => a.blocked)
        .map((a: { area: string }) => a.area)
        .join(', ');
      throw new Error(`Agent found blocking failures in: ${blockingFails}. See tests/reports/agent-final.json`);
    }
  });

  test('agent report contains results for all four coverage areas', async () => {
    const reportPath = path.join(REPORTS_DIR, 'agent-final.json');

    if (!fs.existsSync(reportPath)) {
      test.skip(true, 'Agent report not found — run agent-explorer spec first');
      return;
    }

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const areaNames = report.areas?.map((a: { area: string }) => a.area) || [];

    const EXPECTED_AREAS = [
      'pillar-verification',
      'edge-case-hunting',
      'audit-verification',
      'policy-exploration',
    ];

    for (const area of EXPECTED_AREAS) {
      expect(areaNames).toContain(area);
    }
  });

  test('agent summary markdown report is generated', async () => {
    const summaryPath = path.join(REPORTS_DIR, 'agent-summary.md');

    if (!fs.existsSync(summaryPath)) {
      test.skip(true, 'Agent summary not found — run agent test first');
      return;
    }

    const content = fs.readFileSync(summaryPath, 'utf-8');
    expect(content).toContain('VeldrixAI Agent Test Report');
    expect(content.length).toBeGreaterThan(100);
  });
});
