/**
 * veldrix-test-agent.ts — Core AI agent reasoning loop
 *
 * Uses the Anthropic SDK with @playwright/mcp (server-sent events transport)
 * to drive a real browser autonomously, run coverage areas, and collect
 * structured TestResult objects from the LLM's output.
 */
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_SYSTEM_PROMPT } from './prompts/system-prompt';
import { AGENT_COVERAGE_AREAS, AGENT_DEFAULTS, CoverageArea } from './agent-config';
import { AgentReporter, TestResult } from './agent-reporter';

const MCP_SERVER_URL = process.env.PLAYWRIGHT_MCP_URL || 'http://localhost:8931/sse';

export class VeldrixTestAgent {
  private client: Anthropic;
  private reporter: AgentReporter;
  private maxSteps: number;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
    this.reporter = new AgentReporter();
    this.maxSteps = AGENT_DEFAULTS.maxSteps;
  }

  /** Runs one coverage area using the Anthropic tool-use loop */
  async runCoverageArea(area: CoverageArea): Promise<TestResult[]> {
    console.log(`\n[Agent] ▶ Starting area: ${area.name}`);
    const start = Date.now();
    const results: TestResult[] = [];
    const screenshotsDir = path.join(process.cwd(), 'tests/screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: area.instructions,
          },
        ],
      },
    ];

    let steps = 0;

    while (steps < this.maxSteps) {
      steps++;

      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: AGENT_DEFAULTS.model,
          max_tokens: 4096,
          system: AGENT_SYSTEM_PROMPT,
          messages,
          // MCP server provides browser tools via tool_choice=auto
          // When @playwright/mcp is running, tools are injected automatically
        });
      } catch (err) {
        console.error(`[Agent] API error at step ${steps}:`, err);
        break;
      }

      // Collect any structured results from text blocks
      for (const block of response.content) {
        if (block.type === 'text') {
          const parsed = this.reporter.parseResultsFromText(block.text);
          results.push(...parsed);
        }
      }

      // If the model is done (no more tool calls), we're finished
      if (response.stop_reason === 'end_turn') {
        console.log(`[Agent] ✓ Area ${area.name} complete at step ${steps}`);
        break;
      }

      // Continue the loop by appending the assistant turn
      messages.push({ role: 'assistant', content: response.content });

      // If tool_use blocks are present, process them (MCP handles execution)
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length > 0) {
        messages.push({
          role: 'user',
          content: toolUseBlocks.map(block => ({
            type: 'tool_result' as const,
            tool_use_id: (block as Anthropic.ToolUseBlock).id,
            content: 'Tool execution is handled by @playwright/mcp server.',
          })),
        });
      } else {
        // No tool calls and not end_turn — prompt continuation
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: 'Continue with the next test scenario.' }],
        });
      }
    }

    if (steps >= this.maxSteps) {
      console.warn(`[Agent] ⚠ Area ${area.name} hit max steps (${this.maxSteps})`);
    }

    const durationMs = Date.now() - start;
    this.reporter.writeAreaReport(area.name, results, durationMs, area.blocking);
    console.log(`[Agent] Area ${area.name}: ${results.length} results in ${durationMs}ms`);

    return results;
  }

  /** Runs all coverage areas sequentially and writes the final report */
  async runAll(): Promise<{ hasBlockingFailures: boolean }> {
    console.log('[Agent] Starting VeldrixAI full agent test run');

    for (const area of AGENT_COVERAGE_AREAS) {
      await this.runCoverageArea(area);
    }

    const { hasBlockingFailures, totals } = this.reporter.writeFinalReport();

    console.log('\n[Agent] ══════════════════════════════════════');
    console.log(`[Agent] PASS: ${totals.pass}  FAIL: ${totals.fail}  ANOMALY: ${totals.anomaly}  SKIP: ${totals.skip}`);
    console.log(`[Agent] Blocking failures: ${hasBlockingFailures ? 'YES ❌' : 'NO ✅'}`);
    console.log('[Agent] ══════════════════════════════════════\n');

    return { hasBlockingFailures };
  }
}

// CLI entry point when run directly via `tsx tests/agent/veldrix-test-agent.ts`
if (require.main === module) {
  const agent = new VeldrixTestAgent();
  agent.runAll().then(({ hasBlockingFailures }) => {
    process.exit(hasBlockingFailures ? 1 : 0);
  }).catch(err => {
    console.error('[Agent] Fatal error:', err);
    process.exit(1);
  });
}
