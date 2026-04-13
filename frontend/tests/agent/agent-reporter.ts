import * as fs from 'fs';
import * as path from 'path';

export type TestStatus = 'PASS' | 'FAIL' | 'ANOMALY' | 'SKIP';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface TestResult {
  scenario:   string;
  url:        string;
  steps:      string[];
  expected:   string;
  actual:     string;
  status:     TestStatus;
  severity:   Severity;
  screenshot?: string;
  notes?:     string;
}

export interface AreaReport {
  area:         string;
  results:      TestResult[];
  summary: {
    total:    number;
    pass:     number;
    fail:     number;
    anomaly:  number;
    skip:     number;
  };
  durationMs:   number;
  blocking:     boolean;
  blocked:      boolean; // true if blocking && any FAIL
}

export class AgentReporter {
  private areas: AreaReport[] = [];
  private readonly reportsDir: string;

  constructor(reportsDir = path.join(process.cwd(), 'tests/reports')) {
    this.reportsDir = reportsDir;
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  addAreaReport(report: AreaReport): void {
    this.areas.push(report);
  }

  /** Parse JSON objects out of a raw LLM text response */
  parseResultsFromText(text: string): TestResult[] {
    const results: TestResult[] = [];
    const jsonBlocks = text.matchAll(/\{[\s\S]*?"status"\s*:\s*"(PASS|FAIL|ANOMALY|SKIP)"[\s\S]*?\}/g);

    for (const match of jsonBlocks) {
      try {
        const parsed = JSON.parse(match[0]) as TestResult;
        if (parsed.scenario && parsed.status) {
          results.push(parsed);
        }
      } catch {
        // Malformed JSON block — skip
      }
    }

    return results;
  }

  summarise(results: TestResult[]) {
    return {
      total:   results.length,
      pass:    results.filter(r => r.status === 'PASS').length,
      fail:    results.filter(r => r.status === 'FAIL').length,
      anomaly: results.filter(r => r.status === 'ANOMALY').length,
      skip:    results.filter(r => r.status === 'SKIP').length,
    };
  }

  /** Write per-area JSON report */
  writeAreaReport(area: string, results: TestResult[], durationMs: number, blocking: boolean): void {
    const summary = this.summarise(results);
    const report: AreaReport = {
      area,
      results,
      summary,
      durationMs,
      blocking,
      blocked: blocking && summary.fail > 0,
    };
    this.areas.push(report);

    const filePath = path.join(this.reportsDir, `agent-${area}.json`);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    console.log(`[Reporter] ${area}: ${summary.pass}P/${summary.fail}F/${summary.anomaly}A — ${filePath}`);
  }

  /** Write the consolidated agent report */
  writeFinalReport(): {
    hasBlockingFailures: boolean;
    reportPath: string;
    totals: ReturnType<AgentReporter['summarise']>;
  } {
    const allResults = this.areas.flatMap(a => a.results);
    const totals = this.summarise(allResults);
    const hasBlockingFailures = this.areas.some(a => a.blocked);

    const report = {
      generatedAt: new Date().toISOString(),
      buildUrl:    process.env.JENKINS_BUILD_URL || 'local',
      totals,
      hasBlockingFailures,
      areas: this.areas,
    };

    const reportPath = path.join(this.reportsDir, 'agent-final.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Also write a human-readable summary
    const summaryLines = [
      '# VeldrixAI Agent Test Report',
      `Generated: ${report.generatedAt}`,
      `Build:     ${report.buildUrl}`,
      '',
      `## Totals: ${totals.pass} PASS / ${totals.fail} FAIL / ${totals.anomaly} ANOMALY / ${totals.skip} SKIP`,
      hasBlockingFailures ? '⚠️  BLOCKING FAILURES DETECTED' : '✅  No blocking failures',
      '',
      ...this.areas.map(a => [
        `### ${a.area} (${a.blocking ? 'BLOCKING' : 'non-blocking'})`,
        `${a.summary.pass}P / ${a.summary.fail}F / ${a.summary.anomaly}A / ${a.summary.skip}S — ${a.durationMs}ms`,
        ...a.results
          .filter(r => r.status !== 'PASS')
          .map(r => `  - [${r.status}] ${r.scenario} (${r.severity})`),
      ].join('\n')),
    ];

    const summaryPath = path.join(this.reportsDir, 'agent-summary.md');
    fs.writeFileSync(summaryPath, summaryLines.join('\n'));

    console.log(`\n[Reporter] Final report: ${reportPath}`);
    console.log(`[Reporter] Summary:      ${summaryPath}`);

    return { hasBlockingFailures, reportPath, totals };
  }
}
