import type { SDKVersion, CodeExample, FAQ } from "./types";

export const sdkVersions: SDKVersion[] = [
  {
    language: "Python",
    version: "1.4.2",
    releasedAt: "2025-01-10",
    installCommand: "pip install aegisai",
    packageName: "aegisai",
    changelog: [
      {
        version: "1.4.2",
        date: "2025-01-10",
        changes: [
          "Fixed async context manager cleanup in streaming mode",
          "Added retry configuration for transient network errors",
          "Improved PII detection accuracy in pre-processing hooks",
        ],
      },
      {
        version: "1.4.1",
        date: "2024-12-28",
        changes: [
          "Added support for custom policy document uploads",
          "New `aegisai.analyze()` method for post-processing checks",
          "Performance improvements for batch embedding requests",
        ],
      },
      {
        version: "1.4.0",
        date: "2024-12-15",
        changes: [
          "Introduced Agent Tool-Call Check API",
          "Added strictness threshold configuration",
          "New escalation flow handling with callback support",
          "Breaking: `evaluate()` now returns `EvaluationResult` instead of dict",
        ],
      },
      {
        version: "1.3.0",
        date: "2024-11-20",
        changes: [
          "Added streaming support for guarded generation",
          "New policy versioning system",
          "Improved error messages with actionable suggestions",
        ],
      },
    ],
  },
  {
    language: "Node",
    version: "2.1.0",
    releasedAt: "2025-01-12",
    installCommand: "npm install @aegisai/sdk",
    packageName: "@aegisai/sdk",
    changelog: [
      {
        version: "2.1.0",
        date: "2025-01-12",
        changes: [
          "Added TypeScript 5.x support with improved type inference",
          "New `aegisai.toolCheck()` for agent tool-call validation",
          "Added Express and Fastify middleware helpers",
        ],
      },
      {
        version: "2.0.1",
        date: "2024-12-30",
        changes: [
          "Fixed memory leak in long-running WebSocket connections",
          "Added configurable timeout for evaluation requests",
          "Improved ESM and CommonJS dual-module support",
        ],
      },
      {
        version: "2.0.0",
        date: "2024-12-18",
        changes: [
          "Major rewrite with full TypeScript support",
          "New `AegisClient` class with builder pattern",
          "Added streaming analysis for real-time content moderation",
          "Breaking: Renamed `check()` to `evaluate()` for API consistency",
          "Breaking: Minimum Node.js version is now 18.x",
        ],
      },
      {
        version: "1.5.0",
        date: "2024-11-25",
        changes: [
          "Added batch evaluation support",
          "New webhook integration for async results",
          "Improved rate limit handling with automatic backoff",
        ],
      },
    ],
  },
];

export const codeExamples: CodeExample[] = [
  {
    title: "Guarded Generation",
    description: "Wrap your LLM calls with AegisAI to automatically enforce policies before and after generation.",
    python: `import aegisai
from openai import OpenAI

client = OpenAI()
aegis = aegisai.Client(api_key="your-aegis-api-key")

# Pre-check the user input
pre_check = aegis.evaluate(
    input_text=user_message,
    policy_id="pol_ecs_001",
    strictness=3
)

if pre_check.action == "block":
    print(f"Blocked: {pre_check.reason}")
else:
    # Safe to proceed with generation
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": pre_check.guarded_prompt},
            {"role": "user", "content": user_message}
        ]
    )

    # Post-check the output
    post_check = aegis.analyze(
        output_text=response.choices[0].message.content,
        report_id=pre_check.report_id
    )

    if post_check.safe:
        print(response.choices[0].message.content)
    else:
        print(f"Output filtered: {post_check.reason}")`,
    node: `import AegisAI from '@aegisai/sdk';
import OpenAI from 'openai';

const openai = new OpenAI();
const aegis = new AegisAI({ apiKey: 'your-aegis-api-key' });

// Pre-check the user input
const preCheck = await aegis.evaluate({
  inputText: userMessage,
  policyId: 'pol_ecs_001',
  strictness: 3,
});

if (preCheck.action === 'block') {
  console.log(\`Blocked: \${preCheck.reason}\`);
} else {
  // Safe to proceed with generation
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: preCheck.guardedPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  // Post-check the output
  const postCheck = await aegis.analyze({
    outputText: response.choices[0].message.content,
    reportId: preCheck.reportId,
  });

  if (postCheck.safe) {
    console.log(response.choices[0].message.content);
  } else {
    console.log(\`Output filtered: \${postCheck.reason}\`);
  }
}`,
  },
  {
    title: "Post-Processing Analyze",
    description: "Analyze LLM outputs after generation to detect policy violations, PII leakage, and content issues.",
    python: `import aegisai

aegis = aegisai.Client(api_key="your-aegis-api-key")

# Analyze any text for policy compliance
result = aegis.analyze(
    output_text=llm_response,
    policy_id="pol_pii_002",
    check_pii=True,
    check_toxicity=True,
    check_relevance=True
)

print(f"Safe: {result.safe}")
print(f"Risk Score: {result.risk_score}/100")
print(f"Report ID: {result.report_id}")

for violation in result.violations:
    print(f"  [{violation.severity}] {violation.category}: {violation.description}")
    print(f"  Confidence: {violation.confidence}")

# Optionally get a rewritten safe version
if not result.safe and result.rewritten_text:
    print(f"Safe alternative: {result.rewritten_text}")`,
    node: `import AegisAI from '@aegisai/sdk';

const aegis = new AegisAI({ apiKey: 'your-aegis-api-key' });

// Analyze any text for policy compliance
const result = await aegis.analyze({
  outputText: llmResponse,
  policyId: 'pol_pii_002',
  checkPii: true,
  checkToxicity: true,
  checkRelevance: true,
});

console.log(\`Safe: \${result.safe}\`);
console.log(\`Risk Score: \${result.riskScore}/100\`);
console.log(\`Report ID: \${result.reportId}\`);

for (const violation of result.violations) {
  console.log(\`  [\${violation.severity}] \${violation.category}: \${violation.description}\`);
  console.log(\`  Confidence: \${violation.confidence}\`);
}

// Optionally get a rewritten safe version
if (!result.safe && result.rewrittenText) {
  console.log(\`Safe alternative: \${result.rewrittenText}\`);
}`,
  },
  {
    title: "Agent Tool-Call Check",
    description: "Validate and guard AI agent tool calls before execution to prevent unauthorized actions.",
    python: `import aegisai

aegis = aegisai.Client(api_key="your-aegis-api-key")

# Define the tool call from your AI agent
tool_call = {
    "function": "execute_sql",
    "arguments": {
        "query": "SELECT * FROM users WHERE email = 'john@example.com'",
        "database": "production"
    }
}

# Check if the tool call is safe to execute
check = aegis.tool_check(
    tool_call=tool_call,
    agent_id="agent_support_bot",
    policy_id="pol_ecs_001",
    context={
        "user_role": "support_agent",
        "session_id": "sess_abc123"
    }
)

if check.allowed:
    # Safe to execute the tool call
    result = execute_tool(tool_call)
    print(f"Tool executed successfully. Report: {check.report_id}")
elif check.action == "rewrite":
    # Execute the sanitized version
    result = execute_tool(check.rewritten_call)
    print(f"Executed rewritten call. Report: {check.report_id}")
else:
    print(f"Tool call blocked: {check.reason}")
    print(f"Violations: {check.violations}")`,
    node: `import AegisAI from '@aegisai/sdk';

const aegis = new AegisAI({ apiKey: 'your-aegis-api-key' });

// Define the tool call from your AI agent
const toolCall = {
  function: 'execute_sql',
  arguments: {
    query: "SELECT * FROM users WHERE email = 'john@example.com'",
    database: 'production',
  },
};

// Check if the tool call is safe to execute
const check = await aegis.toolCheck({
  toolCall,
  agentId: 'agent_support_bot',
  policyId: 'pol_ecs_001',
  context: {
    userRole: 'support_agent',
    sessionId: 'sess_abc123',
  },
});

if (check.allowed) {
  // Safe to execute the tool call
  const result = await executeTool(toolCall);
  console.log(\`Tool executed successfully. Report: \${check.reportId}\`);
} else if (check.action === 'rewrite') {
  // Execute the sanitized version
  const result = await executeTool(check.rewrittenCall);
  console.log(\`Executed rewritten call. Report: \${check.reportId}\`);
} else {
  console.log(\`Tool call blocked: \${check.reason}\`);
  console.log(\`Violations: \${JSON.stringify(check.violations)}\`);
}`,
  },
];

export const faqs: FAQ[] = [
  {
    question: "What are the rate limits for the AegisAI API?",
    answer: "Free tier: 100 requests/minute, 10,000 requests/day. Pro tier: 1,000 requests/minute, 100,000 requests/day. Enterprise tier: Custom limits based on your contract. Rate limit headers (X-RateLimit-Remaining, X-RateLimit-Reset) are included in every response.",
  },
  {
    question: "How should I handle retries?",
    answer: "The SDK includes automatic retry with exponential backoff for transient errors (5xx, network timeouts). Default: 3 retries with 1s, 2s, 4s delays. Configure via `aegis.configure(max_retries=5, retry_delay=2.0)` in Python or `new AegisAI({ maxRetries: 5, retryDelay: 2000 })` in Node.",
  },
  {
    question: "What timeout values should I use?",
    answer: "Default timeout is 30 seconds. For evaluate/analyze calls, 10-15 seconds is recommended. For tool-check calls, 5-10 seconds. For batch operations, up to 60 seconds. Set via `aegis.configure(timeout=15)` in Python or `new AegisAI({ timeout: 15000 })` in Node.",
  },
  {
    question: "What error codes does the API return?",
    answer: "400: Invalid request parameters. 401: Invalid or missing API key. 403: API key lacks required permissions. 404: Policy or resource not found. 429: Rate limit exceeded. 500: Internal server error. 503: Service temporarily unavailable. All errors include a machine-readable `error_code` and human-readable `message` field.",
  },
  {
    question: "How do I rotate my API keys?",
    answer: "1. Generate a new API key in the dashboard (Settings > API Keys). 2. Update your environment variables with the new key. 3. Verify the new key works by making a test evaluate call. 4. Revoke the old key in the dashboard. Both keys are valid simultaneously during the rotation window.",
  },
  {
    question: "Does AegisAI support streaming responses?",
    answer: "Yes. Use `aegis.evaluate_stream()` in Python or `aegis.evaluateStream()` in Node to analyze streaming LLM responses in real-time. The SDK buffers chunks and runs policy checks incrementally, allowing you to stop generation early if a violation is detected.",
  },
];
