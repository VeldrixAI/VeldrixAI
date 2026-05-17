// lib/docs/content.ts
// HTML content for all 37 VeldrixAI documentation pages.
//
// NOTE: When veldrixAI_docs.html is available, replace each page's htmlContent
// with the exact extracted HTML from the PAGES object in that file.
// Do NOT rewrite or summarize — preserve HTML verbatim.

export interface DocPageContent {
  id: string;
  title: string;
  leadText?: string;
  toc: Array<{ id: string; label: string }>;
  htmlContent: string;
}

const DOC_PAGES: Record<string, DocPageContent> = {
  welcome: {
    id: "welcome",
    title: "Welcome to VeldrixAI",
    leadText: "VeldrixAI is the runtime trust infrastructure layer for production AI systems.",
    toc: [
      { id: "what-is-veldrixai", label: "What is VeldrixAI?" },
      { id: "how-it-works", label: "How it works" },
      { id: "next-steps", label: "Next steps" },
    ],
    htmlContent: `
<h2 id="what-is-veldrixai">What is VeldrixAI?</h2>
<p>VeldrixAI is the control layer between your AI applications and the real world. It intercepts every LLM response, evaluates it against your governance policies, and enforces the appropriate action — all with sub-50ms P95 latency.</p>

<div class="cl cl-info">
  <strong>You are reading documentation for VeldrixAI v3.1.</strong> API and SDK interfaces are stable.
</div>

<h2 id="how-it-works">How it works</h2>
<p>Every request flows through the Trust Engine, which runs five parallel evaluation pillars:</p>
<div class="cards">
  <div class="card">
    <h4>Safety &amp; Toxicity</h4>
    <p>Detects harmful, violent, or self-harm-inducing content.</p>
  </div>
  <div class="card">
    <h4>Hallucination Detection</h4>
    <p>Flags fabricated facts, false citations, and invented statistics.</p>
  </div>
  <div class="card">
    <h4>Bias &amp; Fairness</h4>
    <p>Identifies discriminatory framing and stereotyping.</p>
  </div>
  <div class="card">
    <h4>Prompt Security</h4>
    <p>Blocks injection attacks, jailbreaks, and adversarial patterns.</p>
  </div>
  <div class="card">
    <h4>Compliance &amp; PII</h4>
    <p>Scans for regulated data categories and PII disclosure.</p>
  </div>
</div>

<h2 id="next-steps">Next steps</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Follow the <a href="/docs/quickstart">Quickstart</a> to make your first evaluation request.</p></div>
  <div class="step"><span class="snum">2</span><p>Read <a href="/docs/concepts">Core Concepts</a> to understand Trust Scores, Pillars, and Policies.</p></div>
  <div class="step"><span class="snum">3</span><p>Integrate via <a href="/docs/integrations-python">Python SDK</a> or <a href="/docs/integrations-rest">REST API</a>.</p></div>
</div>`,
  },

  quickstart: {
    id: "quickstart",
    title: "Quickstart",
    leadText: "Make your first evaluation request in under 5 minutes.",
    toc: [
      { id: "install", label: "Install the SDK" },
      { id: "first-request", label: "Your first request" },
      { id: "reading-results", label: "Reading results" },
    ],
    htmlContent: `
<h2 id="install">Install the SDK</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><span class="cbt" data-lang="typescript">TypeScript</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>pip install veldrixai</code></pre>
  <pre data-lang="typescript" style="display:none"><code>npm install @veldrixai/sdk</code></pre>
</div>

<h2 id="first-request">Your first request</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><span class="cbt" data-lang="typescript">TypeScript</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>import veldrixai

client = veldrixai.Client(api_key="vx_live_...")

result = client.evaluate(
    prompt="Summarize the patient's medical history.",
    response="The patient, John Smith (DOB 1985-03-12), has hypertension.",
    pillars=["compliance", "safety"],
)

print(result.trust_score)       # 0.34
print(result.action)            # "mask"
print(result.violations[0])     # PII detected: name, date-of-birth</code></pre>
  <pre data-lang="typescript" style="display:none"><code>import { VeldrixClient } from "@veldrixai/sdk";

const client = new VeldrixClient({ apiKey: "vx_live_..." });

const result = await client.evaluate({
  prompt: "Summarize the patient's medical history.",
  response: "The patient, John Smith (DOB 1985-03-12), has hypertension.",
  pillars: ["compliance", "safety"],
});

console.log(result.trustScore);      // 0.34
console.log(result.action);          // "mask"
console.log(result.violations[0]);   // PII detected: name, date-of-birth</code></pre>
</div>

<h2 id="reading-results">Reading results</h2>
<table>
  <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
  <tbody>
    <tr><td><code>trust_score</code></td><td>float 0–1</td><td>Aggregate trust score. Higher = safer.</td></tr>
    <tr><td><code>action</code></td><td>string</td><td>Enforcement action taken (allow, block, mask, etc.)</td></tr>
    <tr><td><code>violations</code></td><td>list</td><td>List of detected policy violations with details.</td></tr>
    <tr><td><code>pillar_scores</code></td><td>dict</td><td>Per-pillar breakdown scores.</td></tr>
    <tr><td><code>latency_ms</code></td><td>int</td><td>Total evaluation latency in milliseconds.</td></tr>
  </tbody>
</table>`,
  },

  concepts: {
    id: "concepts",
    title: "Core Concepts",
    leadText: "Understand the building blocks of VeldrixAI: Trust Scores, Pillars, Policies, and Enforcement Actions.",
    toc: [
      { id: "trust-score", label: "Trust Score" },
      { id: "pillars", label: "Pillars" },
      { id: "policies", label: "Policies" },
      { id: "enforcement", label: "Enforcement Actions" },
      { id: "modes", label: "Evaluation Modes" },
    ],
    htmlContent: `
<h2 id="trust-score">Trust Score</h2>
<p>Every evaluation produces a <strong>Trust Score</strong> — a float between 0 and 1. A score of <code>1.0</code> means the response is clean across all evaluated pillars. A score below your policy threshold triggers an enforcement action.</p>
<div class="cl cl-info">Trust Score is a weighted aggregate. You can configure per-pillar weights in your policy settings.</div>

<h2 id="pillars">Pillars</h2>
<p>VeldrixAI evaluates responses through five independent pillars. Each pillar runs in parallel — total latency equals the slowest single pillar, not the sum of all five.</p>

<h2 id="policies">Policies</h2>
<p>A policy binds together: which pillars to run, what thresholds to use, and what enforcement action to take on violation. Policies are versioned and can be deployed without downtime.</p>

<h2 id="enforcement">Enforcement Actions</h2>
<p>Seven enforcement actions are available, listed by priority:</p>
<table>
  <thead><tr><th>Action</th><th>Priority</th><th>Effect</th></tr></thead>
  <tbody>
    <tr><td><code>escalate</code></td><td>1</td><td>Hold response; route to human review queue</td></tr>
    <tr><td><code>block</code></td><td>2</td><td>Suppress response; return configured fallback</td></tr>
    <tr><td><code>rewrite</code></td><td>3</td><td>Replace with policy-safe version</td></tr>
    <tr><td><code>regenerate</code></td><td>4</td><td>Re-invoke LLM with adjusted prompt</td></tr>
    <tr><td><code>mask</code></td><td>5</td><td>Redact PII/sensitive entities in-place</td></tr>
    <tr><td><code>disclaimer</code></td><td>6</td><td>Append legal or regulatory disclosure</td></tr>
    <tr><td><code>allow</code></td><td>7</td><td>Pass response through unchanged</td></tr>
  </tbody>
</table>

<h2 id="modes">Evaluation Modes</h2>
<p><strong>Inline mode:</strong> Evaluation happens synchronously before the response is delivered. Adds 10–50ms P95 latency.</p>
<p><strong>Background mode:</strong> Response is delivered immediately; evaluation runs async. Adds zero latency to your critical path. Violations trigger post-delivery enforcement (e.g., audit log entry, escalation).</p>`,
  },

  "manage-accounts": {
    id: "manage-accounts",
    title: "Manage Accounts",
    leadText: "Create and manage your VeldrixAI workspace and team members.",
    toc: [
      { id: "create-account", label: "Create an account" },
      { id: "team-members", label: "Team members" },
      { id: "roles", label: "Roles & permissions" },
    ],
    htmlContent: `
<h2 id="create-account">Create an account</h2>
<p>Sign up at <a href="https://app.veldrixai.ca/signup" target="_blank" rel="noopener noreferrer">app.veldrixai.ca/signup</a>. You can use email/password, Google OAuth, or GitHub OAuth.</p>
<div class="cl cl-info">All new accounts start on a 14-day free trial of the Growth plan. No credit card required.</div>

<h2 id="team-members">Team members</h2>
<p>From the dashboard, navigate to <strong>Settings → Team</strong> to invite team members by email. All plans support unlimited team members.</p>

<h2 id="roles">Roles &amp; permissions</h2>
<table>
  <thead><tr><th>Role</th><th>Capabilities</th></tr></thead>
  <tbody>
    <tr><td>Owner</td><td>Full access including billing and plan management</td></tr>
    <tr><td>Admin</td><td>Create policies, manage API keys, view all audit logs</td></tr>
    <tr><td>Developer</td><td>Create API keys, run evaluations, view own audit logs</td></tr>
    <tr><td>Viewer</td><td>Read-only access to dashboard and audit logs</td></tr>
  </tbody>
</table>`,
  },

  "api-keys": {
    id: "api-keys",
    title: "Manage API Keys",
    leadText: "Create, rotate, and revoke API keys for authenticating with the VeldrixAI API.",
    toc: [
      { id: "create-key", label: "Create a key" },
      { id: "key-format", label: "Key format" },
      { id: "rotate-revoke", label: "Rotate & revoke" },
    ],
    htmlContent: `
<h2 id="create-key">Create a key</h2>
<p>Navigate to <strong>Dashboard → API Keys → New Key</strong>. Give the key a descriptive name (e.g., <code>production-app</code>) and optionally restrict it to specific IP ranges.</p>
<div class="cl cl-warn">API keys are shown only once at creation. Store them securely — treat them like passwords.</div>

<h2 id="key-format">Key format</h2>
<p>All VeldrixAI API keys follow this format:</p>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>vx_live_&lt;base62-string&gt;    # Production
vx_test_&lt;base62-string&gt;    # Sandbox / testing</code></pre></div>

<h2 id="rotate-revoke">Rotate &amp; revoke</h2>
<p>To rotate a key, click <strong>Rotate</strong> in the API Keys table. The old key is invalidated immediately. To revoke without replacement, click <strong>Revoke</strong>.</p>`,
  },

  "trust-overview": {
    id: "trust-overview",
    title: "Trust Engine Overview",
    leadText: "The Trust Engine is the core evaluation layer. It runs all five pillars in parallel for every request.",
    toc: [
      { id: "architecture", label: "Architecture" },
      { id: "latency", label: "Latency model" },
      { id: "pillar-weights", label: "Pillar weights" },
    ],
    htmlContent: `
<h2 id="architecture">Architecture</h2>
<p>When your application calls <code>POST /api/v1/analyze</code>, the Trust Engine:</p>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Tokenizes and preprocesses the prompt + response pair.</p></div>
  <div class="step"><span class="snum">2</span><p>Dispatches all requested pillars in parallel.</p></div>
  <div class="step"><span class="snum">3</span><p>Aggregates per-pillar scores using your policy weights.</p></div>
  <div class="step"><span class="snum">4</span><p>Determines the enforcement action based on your policy thresholds.</p></div>
  <div class="step"><span class="snum">5</span><p>Returns the evaluation result (inline mode) or logs and acts async (background mode).</p></div>
</div>

<h2 id="latency">Latency model</h2>
<p>Total evaluation latency equals the slowest single pillar (not the sum). P95 latency target is <strong>&lt; 50ms</strong> in inline mode with all five pillars running.</p>

<h2 id="pillar-weights">Pillar weights</h2>
<p>Each pillar contributes to the aggregate Trust Score according to its weight. Default weights are equal (0.2 per pillar). You can adjust weights per policy.</p>`,
  },

  "trust-safety": {
    id: "trust-safety",
    title: "Safety & Toxicity",
    leadText: "Detect harmful, violent, dangerous, or self-harm-inducing content in AI output.",
    toc: [
      { id: "what-it-detects", label: "What it detects" },
      { id: "scoring", label: "Scoring" },
      { id: "configuration", label: "Configuration" },
    ],
    htmlContent: `
<h2 id="what-it-detects">What it detects</h2>
<ul>
  <li>Violent or graphic content</li>
  <li>Hate speech and targeted harassment</li>
  <li>Self-harm and suicide-related content</li>
  <li>Content harmful to minors</li>
  <li>Instructions for dangerous activities</li>
</ul>

<h2 id="scoring">Scoring</h2>
<p>The Safety pillar returns a score from 0 to 1. A score of <code>0.0</code> indicates severe violations; <code>1.0</code> means clean. The default blocking threshold is <code>0.3</code>.</p>

<h2 id="configuration">Configuration</h2>
<p>In your policy settings, you can configure:</p>
<ul>
  <li><strong>Threshold:</strong> Score below which the action triggers (default 0.3)</li>
  <li><strong>Action:</strong> What to do on violation (default: block)</li>
  <li><strong>Categories:</strong> Which sub-categories to enable (all enabled by default)</li>
</ul>`,
  },

  "trust-hallucination": {
    id: "trust-hallucination",
    title: "Hallucination Detection",
    leadText: "Estimate factual confidence and flag fabricated information, false citations, and invented statistics.",
    toc: [
      { id: "detection-method", label: "Detection method" },
      { id: "rag-grounding", label: "RAG grounding" },
      { id: "limitations", label: "Limitations" },
    ],
    htmlContent: `
<h2 id="detection-method">Detection method</h2>
<p>VeldrixAI's hallucination pillar uses ensemble confidence estimation across multiple specialized models. It identifies:</p>
<ul>
  <li>Invented statistics and numeric claims</li>
  <li>False citations and nonexistent sources</li>
  <li>Factual claims inconsistent with the provided context</li>
  <li>Date and entity inconsistencies</li>
</ul>

<h2 id="rag-grounding">RAG grounding</h2>
<p>For maximum accuracy, pass your retrieval context in the <code>context</code> field of the evaluate request. The pillar will verify that response claims are grounded in your retrieved documents.</p>
<div class="cl cl-tip">Grounded evaluation reduces false-positive rates by 60–80% compared to context-free evaluation.</div>

<h2 id="limitations">Limitations</h2>
<p>Without a ground-truth context, the pillar estimates plausibility from world-knowledge priors. This is effective for obvious fabrications but may miss subtle domain-specific errors.</p>`,
  },

  "trust-bias": {
    id: "trust-bias",
    title: "Bias & Fairness",
    leadText: "Identify discriminatory framing, gender or racial stereotyping, and ethically problematic outputs.",
    toc: [
      { id: "bias-categories", label: "Bias categories" },
      { id: "fairness-scoring", label: "Fairness scoring" },
    ],
    htmlContent: `
<h2 id="bias-categories">Bias categories</h2>
<ul>
  <li>Gender and sexuality bias</li>
  <li>Racial and ethnic bias</li>
  <li>Age discrimination</li>
  <li>Socioeconomic stereotyping</li>
  <li>Religious bias</li>
  <li>Disability bias</li>
</ul>

<h2 id="fairness-scoring">Fairness scoring</h2>
<p>The bias pillar scores each response for demographic fairness. A score of <code>1.0</code> indicates no detectable bias. The default alert threshold is <code>0.5</code>.</p>
<div class="cl cl-warn">Bias detection is probabilistic. Always review flagged content in context before taking automated action in high-stakes workflows.</div>`,
  },

  "trust-prompt-security": {
    id: "trust-prompt-security",
    title: "Prompt Security",
    leadText: "Detect prompt injection attacks, jailbreak attempts, role-playing exploits, and adversarial input patterns.",
    toc: [
      { id: "attack-types", label: "Attack types" },
      { id: "detection-layers", label: "Detection layers" },
      { id: "response", label: "Response" },
    ],
    htmlContent: `
<h2 id="attack-types">Attack types</h2>
<ul>
  <li><strong>Prompt injection:</strong> Malicious instructions embedded in user input</li>
  <li><strong>Jailbreak attempts:</strong> Requests to bypass safety instructions via roleplay, hypotheticals, or encoding tricks</li>
  <li><strong>Goal hijacking:</strong> Inputs that try to redirect the model's objective</li>
  <li><strong>Context manipulation:</strong> Attempts to overwrite the system prompt</li>
</ul>

<h2 id="detection-layers">Detection layers</h2>
<p>Prompt Security runs on both the <em>input</em> (user prompt) and the <em>output</em> (model response) to catch both direct attacks and successful manipulations.</p>

<h2 id="response">Response</h2>
<p>On detection, the default action is <code>block</code>. You can configure <code>escalate</code> to route suspicious inputs to human review instead.</p>`,
  },

  "trust-compliance": {
    id: "trust-compliance",
    title: "Compliance & PII",
    leadText: "Scan for personally identifiable information, regulated data categories, and policy-specific prohibited disclosures.",
    toc: [
      { id: "pii-types", label: "PII types" },
      { id: "regulatory-frameworks", label: "Regulatory frameworks" },
      { id: "masking", label: "PII masking" },
    ],
    htmlContent: `
<h2 id="pii-types">PII types detected</h2>
<ul>
  <li>Names, dates of birth, government IDs</li>
  <li>Email addresses, phone numbers, physical addresses</li>
  <li>Financial identifiers (account numbers, card numbers)</li>
  <li>Medical record numbers and PHI</li>
  <li>IP addresses and device identifiers</li>
  <li>Biometric identifiers</li>
</ul>

<h2 id="regulatory-frameworks">Regulatory frameworks</h2>
<p>The compliance pillar maps detected entities to relevant regulatory frameworks:</p>
<ul>
  <li><strong>GDPR:</strong> Personal data (Art. 4) and special category data (Art. 9)</li>
  <li><strong>HIPAA:</strong> Protected Health Information (PHI) — 18 identifiers</li>
  <li><strong>CCPA:</strong> California personal information categories</li>
  <li><strong>PCI DSS:</strong> Cardholder data environment identifiers</li>
</ul>

<h2 id="masking">PII masking</h2>
<p>When the <code>mask</code> action is configured, detected PII is replaced with typed placeholders: <code>[NAME]</code>, <code>[EMAIL]</code>, <code>[SSN]</code>, etc. The masked response is returned to your application.</p>`,
  },

  "policy-overview": {
    id: "policy-overview",
    title: "Policy Engine Overview",
    leadText: "Policies bind together pillar configuration, thresholds, and enforcement actions into deployable governance rules.",
    toc: [
      { id: "policy-model", label: "Policy model" },
      { id: "default-policy", label: "Default policy" },
      { id: "limits", label: "Policy limits by plan" },
    ],
    htmlContent: `
<h2 id="policy-model">Policy model</h2>
<p>A policy defines:</p>
<ul>
  <li>Which pillars to evaluate</li>
  <li>Per-pillar weights and thresholds</li>
  <li>The enforcement action for each threshold breach</li>
  <li>Background vs. inline evaluation mode</li>
</ul>

<h2 id="default-policy">Default policy</h2>
<p>Every new workspace is provisioned with a default policy that runs all five pillars at equal weights with conservative thresholds. You can modify or replace it at any time.</p>

<h2 id="limits">Policy limits by plan</h2>
<table>
  <thead><tr><th>Plan</th><th>Active policies</th></tr></thead>
  <tbody>
    <tr><td>Starter</td><td>3</td></tr>
    <tr><td>Growth</td><td>20</td></tr>
    <tr><td>Enterprise</td><td>Unlimited</td></tr>
  </tbody>
</table>`,
  },

  "policy-create": {
    id: "policy-create",
    title: "Create a Policy",
    leadText: "Step-by-step guide to creating your first governance policy.",
    toc: [
      { id: "via-dashboard", label: "Via dashboard" },
      { id: "via-api", label: "Via API" },
    ],
    htmlContent: `
<h2 id="via-dashboard">Via dashboard</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Navigate to <strong>Dashboard → Policies → New Policy</strong>.</p></div>
  <div class="step"><span class="snum">2</span><p>Name your policy and optionally add a description.</p></div>
  <div class="step"><span class="snum">3</span><p>Select the pillars to enable and set per-pillar thresholds.</p></div>
  <div class="step"><span class="snum">4</span><p>Choose the enforcement action for each pillar violation.</p></div>
  <div class="step"><span class="snum">5</span><p>Set the evaluation mode (inline or background).</p></div>
  <div class="step"><span class="snum">6</span><p>Save and deploy. The policy takes effect immediately.</p></div>
</div>

<h2 id="via-api">Via API</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>POST /api/v1/policies
Authorization: Bearer vx_live_...
Content-Type: application/json

{
  "name": "hipaa-strict",
  "pillars": {
    "compliance": { "weight": 0.5, "threshold": 0.6, "action": "block" },
    "safety":     { "weight": 0.3, "threshold": 0.4, "action": "block" },
    "hallucination": { "weight": 0.2, "threshold": 0.5, "action": "disclaimer" }
  },
  "mode": "inline"
}</code></pre></div>`,
  },

  "policy-weights": {
    id: "policy-weights",
    title: "Weights & Thresholds",
    leadText: "Fine-tune how each pillar contributes to the aggregate Trust Score and when actions trigger.",
    toc: [
      { id: "weight-model", label: "Weight model" },
      { id: "threshold-model", label: "Threshold model" },
      { id: "tuning-guide", label: "Tuning guide" },
    ],
    htmlContent: `
<h2 id="weight-model">Weight model</h2>
<p>Per-pillar weights must sum to 1.0. The aggregate Trust Score is a weighted average of all enabled pillar scores.</p>
<div class="cl cl-info">If you only enable 3 of 5 pillars, their weights must still sum to 1.0.</div>

<h2 id="threshold-model">Threshold model</h2>
<p>Each pillar has an independent threshold. If a pillar score falls below its threshold, the configured action triggers — regardless of the aggregate score. This allows fine-grained control over critical pillars.</p>

<h2 id="tuning-guide">Tuning guide</h2>
<ul>
  <li>Start with the default policy and review audit logs for false positives.</li>
  <li>Adjust thresholds conservatively — lower threshold = more violations flagged.</li>
  <li>Use background mode + escalate action during tuning to avoid blocking legitimate traffic.</li>
</ul>`,
  },

  "policy-versioning": {
    id: "policy-versioning",
    title: "Policy Versioning",
    leadText: "VeldrixAI maintains a full version history for every policy, enabling rollback and audit trail compliance.",
    toc: [
      { id: "versions", label: "How versioning works" },
      { id: "rollback", label: "Rolling back" },
    ],
    htmlContent: `
<h2 id="versions">How versioning works</h2>
<p>Every change to a policy creates a new immutable version. The active version is the one applied to all evaluations. Previous versions are retained indefinitely.</p>

<h2 id="rollback">Rolling back</h2>
<p>To roll back to a previous policy version, select it in <strong>Dashboard → Policies → [Policy Name] → Version History</strong> and click <strong>Set as Active</strong>. Changes take effect immediately.</p>`,
  },

  "agent-overview": {
    id: "agent-overview",
    title: "Agent Guard Overview",
    leadText: "Agent Guard extends VeldrixAI's trust evaluation to multi-step AI agent workflows, intercepting tool calls and intermediate reasoning steps.",
    toc: [
      { id: "what-is-agent-guard", label: "What is Agent Guard?" },
      { id: "supported-frameworks", label: "Supported frameworks" },
      { id: "availability", label: "Availability" },
    ],
    htmlContent: `
<h2 id="what-is-agent-guard">What is Agent Guard?</h2>
<p>Agent Guard wraps your AI agent framework to intercept and evaluate:</p>
<ul>
  <li>Intermediate LLM responses during chain execution</li>
  <li>Tool call requests and their parameters</li>
  <li>Final agent outputs</li>
</ul>

<h2 id="supported-frameworks">Supported frameworks</h2>
<ul>
  <li>LangChain (stable)</li>
  <li>CrewAI (stable)</li>
  <li>AutoGen (beta)</li>
</ul>

<h2 id="availability">Availability</h2>
<div class="cl cl-info">Agent Guard is available on Growth and Enterprise plans.</div>`,
  },

  "agent-langchain": {
    id: "agent-langchain",
    title: "LangChain Integration",
    leadText: "Wrap your LangChain agent with VeldrixAI's trust evaluation in three lines of code.",
    toc: [
      { id: "install", label: "Install" },
      { id: "usage", label: "Usage" },
    ],
    htmlContent: `
<h2 id="install">Install</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>pip install veldrixai[langchain]</code></pre></div>

<h2 id="usage">Usage</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>from langchain.agents import AgentExecutor
from veldrixai.integrations.langchain import VeldrixGuard

agent_executor = AgentExecutor(agent=agent, tools=tools)
guarded = VeldrixGuard(agent_executor, api_key="vx_live_...", policy="hipaa-strict")

result = await guarded.ainvoke({"input": user_message})</code></pre></div>`,
  },

  "agent-crewai": {
    id: "agent-crewai",
    title: "CrewAI Integration",
    leadText: "Add trust evaluation to your CrewAI crew with the VeldrixAI callback.",
    toc: [{ id: "usage", label: "Usage" }],
    htmlContent: `
<h2 id="usage">Usage</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>from crewai import Crew, Agent, Task
from veldrixai.integrations.crewai import VeldrixCallback

crew = Crew(
    agents=[agent1, agent2],
    tasks=[task1, task2],
    callbacks=[VeldrixCallback(api_key="vx_live_...", policy="default")],
)

result = crew.kickoff()</code></pre></div>`,
  },

  "agent-autogen": {
    id: "agent-autogen",
    title: "AutoGen Integration",
    leadText: "Beta integration for Microsoft AutoGen multi-agent workflows.",
    toc: [{ id: "usage", label: "Usage" }, { id: "limitations", label: "Beta limitations" }],
    htmlContent: `
<div class="cl cl-warn"><strong>Beta:</strong> The AutoGen integration is under active development. API may change.</div>
<h2 id="usage">Usage</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>from autogen import AssistantAgent
from veldrixai.integrations.autogen import VeldrixAssistant

assistant = VeldrixAssistant(
    name="guarded-assistant",
    llm_config={"model": "gpt-4o"},
    veldrix_api_key="vx_live_...",
    veldrix_policy="default",
)</code></pre></div>

<h2 id="limitations">Beta limitations</h2>
<ul>
  <li>Tool call interception is not yet supported in AutoGen beta</li>
  <li>Group chat scenarios may have higher latency</li>
</ul>`,
  },

  "agent-tool-interception": {
    id: "agent-tool-interception",
    title: "Tool Interception",
    leadText: "Intercept and evaluate agent tool calls before they execute — preventing data exfiltration, unauthorized API access, and prompt injection via tool results.",
    toc: [
      { id: "how-it-works", label: "How it works" },
      { id: "configuration", label: "Configuration" },
    ],
    htmlContent: `
<h2 id="how-it-works">How it works</h2>
<p>When an agent requests a tool call, Agent Guard intercepts the call request and evaluates it against your policy before execution. If the tool call is flagged, it can be blocked or escalated without the tool ever running.</p>

<h2 id="configuration">Configuration</h2>
<p>Enable tool interception in your policy:</p>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>{
  "agent_guard": {
    "intercept_tool_calls": true,
    "intercept_tool_results": true,
    "block_on_prompt_injection": true
  }
}</code></pre></div>`,
  },

  "audit-trails": {
    id: "audit-trails",
    title: "Audit Trails",
    leadText: "Every VeldrixAI evaluation is logged to an immutable, tamper-evident audit trail.",
    toc: [
      { id: "log-structure", label: "Log structure" },
      { id: "querying", label: "Querying logs" },
      { id: "retention", label: "Retention" },
    ],
    htmlContent: `
<h2 id="log-structure">Log structure</h2>
<p>Each audit log entry includes:</p>
<table>
  <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
  <tbody>
    <tr><td><code>request_id</code></td><td>UUID</td><td>Unique identifier for this evaluation</td></tr>
    <tr><td><code>timestamp</code></td><td>ISO 8601</td><td>UTC evaluation time</td></tr>
    <tr><td><code>principal_id</code></td><td>string</td><td>Identifier of the calling entity</td></tr>
    <tr><td><code>policy_id</code></td><td>UUID</td><td>Policy applied</td></tr>
    <tr><td><code>trust_score</code></td><td>float</td><td>Aggregate score</td></tr>
    <tr><td><code>action</code></td><td>string</td><td>Enforcement action taken</td></tr>
    <tr><td><code>violations</code></td><td>array</td><td>Detected violations with details</td></tr>
    <tr><td><code>latency_ms</code></td><td>int</td><td>Evaluation latency</td></tr>
  </tbody>
</table>

<h2 id="querying">Querying logs</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>GET /api/v1/audit?limit=100&amp;action=block&amp;after=2025-01-01T00:00:00Z
Authorization: Bearer vx_live_...</code></pre></div>

<h2 id="retention">Retention</h2>
<table>
  <thead><tr><th>Plan</th><th>Retention</th></tr></thead>
  <tbody>
    <tr><td>Starter</td><td>30 days</td></tr>
    <tr><td>Growth</td><td>90 days</td></tr>
    <tr><td>Enterprise</td><td>Up to 7 years</td></tr>
  </tbody>
</table>`,
  },

  "audit-reports": {
    id: "audit-reports",
    title: "PDF Reports",
    leadText: "Generate compliance-ready PDF reports from your audit trail data.",
    toc: [
      { id: "generate", label: "Generate a report" },
      { id: "availability", label: "Availability" },
    ],
    htmlContent: `
<h2 id="generate">Generate a report</h2>
<p>PDF reports are generated from the dashboard under <strong>Dashboard → Reports → Generate</strong>, or via API:</p>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>POST /api/v1/reports/generate
Authorization: Bearer vx_live_...

{
  "date_range": { "from": "2025-01-01", "to": "2025-01-31" },
  "include_violations": true,
  "include_summary": true
}</code></pre></div>

<h2 id="availability">Availability</h2>
<div class="cl cl-info">PDF compliance reports are available on Growth and Enterprise plans.</div>`,
  },

  "audit-retention": {
    id: "audit-retention",
    title: "Log Retention",
    leadText: "Configure how long audit logs are retained and how to export them before expiry.",
    toc: [
      { id: "defaults", label: "Default retention" },
      { id: "export", label: "Export logs" },
    ],
    htmlContent: `
<h2 id="defaults">Default retention</h2>
<p>Audit logs are retained according to your plan:</p>
<ul>
  <li><strong>Starter:</strong> 30 days</li>
  <li><strong>Growth:</strong> 90 days</li>
  <li><strong>Enterprise:</strong> Up to 7 years (configurable per compliance requirement)</li>
</ul>

<h2 id="export">Export logs</h2>
<p>Export logs in JSONL or CSV format via the dashboard or API before they expire. Enterprise plans can configure automated S3/GCS export destinations.</p>`,
  },

  "prompt-overview": {
    id: "prompt-overview",
    title: "Prompt Architect",
    leadText: "Automatically generate safety-aware, policy-compliant system prompts for your LLM applications.",
    toc: [
      { id: "what-it-does", label: "What it does" },
      { id: "availability", label: "Availability" },
    ],
    htmlContent: `
<h2 id="what-it-does">What it does</h2>
<p>Prompt Architect generates system prompts that are pre-tuned to minimize violations detected by your active VeldrixAI policies. It analyzes your policy configuration and produces prompts that guide the LLM toward compliant outputs.</p>

<h2 id="availability">Availability</h2>
<table>
  <thead><tr><th>Plan</th><th>Generations per month</th></tr></thead>
  <tbody>
    <tr><td>Starter</td><td>3</td></tr>
    <tr><td>Growth</td><td>Unlimited</td></tr>
    <tr><td>Enterprise</td><td>Unlimited</td></tr>
  </tbody>
</table>`,
  },

  "prompt-generate": {
    id: "prompt-generate",
    title: "Generate Templates",
    leadText: "Generate system prompt templates from your policy configuration.",
    toc: [{ id: "usage", label: "Usage" }],
    htmlContent: `
<h2 id="usage">Usage</h2>
<p>From the dashboard, go to <strong>Prompt Architect → Generate</strong>. Select your target policy, use case (customer service, medical assistant, coding assistant, etc.), and tone. Prompt Architect returns a ready-to-use system prompt.</p>
<div class="cl cl-tip">Always test generated prompts against your VeldrixAI evaluation endpoint before deploying to production.</div>`,
  },

  "prompt-modes": {
    id: "prompt-modes",
    title: "Strict / Balanced / Adaptive",
    leadText: "Choose how aggressively Prompt Architect constrains the generated system prompt.",
    toc: [
      { id: "strict", label: "Strict" },
      { id: "balanced", label: "Balanced" },
      { id: "adaptive", label: "Adaptive" },
    ],
    htmlContent: `
<h2 id="strict">Strict</h2>
<p>Maximum constraints. The generated prompt instructs the LLM to refuse borderline requests, add disclaimers aggressively, and ask for clarification rather than guessing. Best for high-risk regulated environments.</p>

<h2 id="balanced">Balanced</h2>
<p>Standard constraints aligned with your policy thresholds. The LLM is instructed to be helpful while respecting boundaries. Recommended for most production applications.</p>

<h2 id="adaptive">Adaptive</h2>
<p>Minimal constraints. The prompt relies on VeldrixAI's runtime enforcement rather than model-side instruction. Best for creative or exploratory use cases where over-refusal is a concern.</p>`,
  },

  "billing-accounts": {
    id: "billing-accounts",
    title: "Manage Accounts (Billing)",
    leadText: "Manage your VeldrixAI subscription, payment methods, and billing contacts.",
    toc: [
      { id: "billing-portal", label: "Billing portal" },
      { id: "invoices", label: "Invoices" },
    ],
    htmlContent: `
<h2 id="billing-portal">Billing portal</h2>
<p>Access your billing portal from <strong>Dashboard → Settings → Billing → Manage Subscription</strong>. The portal is powered by Stripe and allows you to:</p>
<ul>
  <li>View and download invoices</li>
  <li>Update payment methods</li>
  <li>Change or cancel your plan</li>
  <li>Set spend caps for overage protection</li>
</ul>

<h2 id="invoices">Invoices</h2>
<p>Invoices are generated monthly (or annually for annual plans) and sent to the billing email on file. You can also access all invoices from the billing portal.</p>`,
  },

  "billing-overview": {
    id: "billing-overview",
    title: "Billing Overview",
    leadText: "How VeldrixAI billing works — plans, overage, and the evaluation request model.",
    toc: [
      { id: "what-counts", label: "What counts as a request" },
      { id: "overage", label: "Overage billing" },
      { id: "free-trial", label: "Free trial" },
    ],
    htmlContent: `
<h2 id="what-counts">What counts as a request</h2>
<p>One call to <code>POST /api/v1/analyze</code> counts as one evaluation request, regardless of:</p>
<ul>
  <li>How many pillars run</li>
  <li>Whether background or inline mode is used</li>
  <li>The length of the prompt or response</li>
</ul>

<h2 id="overage">Overage billing</h2>
<p>When your monthly quota is exceeded, additional requests are billed at the overage rate for your plan. Overage is calculated daily and charged at the end of the billing cycle.</p>
<div class="cl cl-tip">Set a spend cap in your billing settings to prevent unexpected charges.</div>

<h2 id="free-trial">Free trial</h2>
<p>All new accounts get a 14-day free trial of the Growth plan. No credit card required. At the end of the trial, you can choose any plan or let the workspace expire.</p>`,
  },

  "billing-plans": {
    id: "billing-plans",
    title: "Plans & Pricing",
    leadText: "Choose the right VeldrixAI plan for your team.",
    toc: [
      { id: "plans", label: "Plans" },
      { id: "comparison", label: "Feature comparison" },
      { id: "enterprise", label: "Enterprise" },
    ],
    htmlContent: `
<h2 id="plans">Plans</h2>
<table>
  <thead><tr><th>Plan</th><th>Monthly</th><th>Annual</th><th>Evaluations/mo</th><th>Overage</th></tr></thead>
  <tbody>
    <tr><td>Starter</td><td>$49/mo</td><td>$39/mo</td><td>10,000</td><td>$0.004/req</td></tr>
    <tr><td>Growth</td><td>$299/mo</td><td>$239/mo</td><td>100,000</td><td>$0.003/req</td></tr>
    <tr><td>Enterprise</td><td>Custom</td><td>Custom</td><td>Custom</td><td>Negotiated</td></tr>
  </tbody>
</table>

<h2 id="comparison">Feature comparison</h2>
<table>
  <thead><tr><th>Feature</th><th>Starter</th><th>Growth</th><th>Enterprise</th></tr></thead>
  <tbody>
    <tr><td>Audit log retention</td><td>30 days</td><td>90 days</td><td>Up to 7 years</td></tr>
    <tr><td>Active policies</td><td>3</td><td>20</td><td>Unlimited</td></tr>
    <tr><td>Agent Guard</td><td>—</td><td>✓</td><td>✓</td></tr>
    <tr><td>PDF reports</td><td>—</td><td>✓</td><td>✓</td></tr>
    <tr><td>SLA guarantee</td><td>—</td><td>99.9%</td><td>99.95%</td></tr>
    <tr><td>HIPAA BAA</td><td>—</td><td>—</td><td>✓</td></tr>
    <tr><td>SSO / SAML 2.0</td><td>—</td><td>—</td><td>✓</td></tr>
    <tr><td>Support</td><td>Community</td><td>Email (48h SLA)</td><td>Dedicated CSM</td></tr>
  </tbody>
</table>

<h2 id="enterprise">Enterprise</h2>
<p>Enterprise plans include custom pricing, volume discounts, HIPAA BAA, SSO, IP allowlisting, private cloud deployment, and a dedicated Customer Success Manager. Contact <a href="mailto:sales@veldrixai.ca">sales@veldrixai.ca</a>.</p>`,
  },

  "billing-usage": {
    id: "billing-usage",
    title: "Usage Metering",
    leadText: "Track your evaluation request consumption in real time.",
    toc: [
      { id: "dashboard", label: "Dashboard" },
      { id: "api", label: "API" },
    ],
    htmlContent: `
<h2 id="dashboard">Dashboard</h2>
<p>View real-time usage at <strong>Dashboard → Settings → Billing → Usage</strong>. The usage meter shows:</p>
<ul>
  <li>Requests consumed this billing period</li>
  <li>Requests remaining before quota exhaustion</li>
  <li>Daily request histogram</li>
  <li>Top principals by request volume</li>
</ul>

<h2 id="api">API</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>GET /api/v1/stats/summary
Authorization: Bearer vx_live_...

# Response
{
  "period_start": "2025-01-01T00:00:00Z",
  "period_end": "2025-02-01T00:00:00Z",
  "quota": 100000,
  "used": 34201,
  "remaining": 65799,
  "overage_requests": 0
}</code></pre></div>`,
  },

  "integrations-overview": {
    id: "integrations-overview",
    title: "Integrations Overview",
    leadText: "Connect VeldrixAI to your AI stack via SDK, REST API, or native framework integrations.",
    toc: [
      { id: "options", label: "Integration options" },
      { id: "choosing", label: "Choosing an integration" },
    ],
    htmlContent: `
<h2 id="options">Integration options</h2>
<div class="cards">
  <div class="card">
    <h4>Python SDK</h4>
    <p>Install via pip. Full async support. Recommended for Python backends and notebooks.</p>
  </div>
  <div class="card">
    <h4>TypeScript SDK</h4>
    <p>Install via npm. Works in Node.js and edge runtimes. Type-safe API.</p>
  </div>
  <div class="card">
    <h4>REST API</h4>
    <p>Direct HTTP calls. Works from any language. Use for custom integrations or non-SDK environments.</p>
  </div>
</div>

<h2 id="choosing">Choosing an integration</h2>
<ul>
  <li>Use the <strong>Python SDK</strong> if your backend is Python.</li>
  <li>Use the <strong>TypeScript SDK</strong> if your backend is Node.js or runs on an edge runtime.</li>
  <li>Use the <strong>REST API</strong> for Go, Java, Rust, Ruby, or any other language.</li>
  <li>Use a <strong>framework integration</strong> (LangChain, CrewAI, AutoGen) if you're running agents.</li>
</ul>`,
  },

  "integrations-python": {
    id: "integrations-python",
    title: "Python SDK",
    leadText: "The official VeldrixAI Python SDK for synchronous and async evaluation.",
    toc: [
      { id: "install", label: "Installation" },
      { id: "initialize", label: "Initialize client" },
      { id: "evaluate", label: "Evaluate" },
      { id: "async", label: "Async usage" },
    ],
    htmlContent: `
<h2 id="install">Installation</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>pip install veldrixai
# Or with all extras:
pip install "veldrixai[langchain,crewai]"</code></pre></div>

<h2 id="initialize">Initialize client</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>import veldrixai

# Uses VELDRIX_API_KEY env var if api_key not provided
client = veldrixai.Client(api_key="vx_live_...")</code></pre></div>

<h2 id="evaluate">Evaluate</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>result = client.evaluate(
    prompt="What is the patient's diagnosis?",
    response="Based on the records, Jane has Type 2 diabetes.",
    pillars=["compliance", "safety"],
    policy="hipaa-strict",
)

print(result.trust_score)   # 0.41
print(result.action)        # "mask"</code></pre></div>

<h2 id="async">Async usage</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>import asyncio
import veldrixai

async def main():
    client = veldrixai.AsyncClient(api_key="vx_live_...")
    result = await client.evaluate(prompt="...", response="...")
    return result

asyncio.run(main())</code></pre></div>`,
  },

  "integrations-ts": {
    id: "integrations-ts",
    title: "TypeScript SDK",
    leadText: "The official VeldrixAI TypeScript/JavaScript SDK for Node.js and edge runtimes.",
    toc: [
      { id: "install", label: "Installation" },
      { id: "usage", label: "Usage" },
    ],
    htmlContent: `
<h2 id="install">Installation</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>npm install @veldrixai/sdk
# or
yarn add @veldrixai/sdk</code></pre></div>

<h2 id="usage">Usage</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>import { VeldrixClient } from "@veldrixai/sdk";

const client = new VeldrixClient({
  apiKey: process.env.VELDRIX_API_KEY,
  baseUrl: "https://api.veldrixai.ca",
});

const result = await client.evaluate({
  prompt: "Summarize this document.",
  response: "The document discusses ...",
  pillars: ["safety", "hallucination"],
});

console.log(result.trustScore);  // 0.87
console.log(result.action);      // "allow"</code></pre></div>`,
  },

  "integrations-rest": {
    id: "integrations-rest",
    title: "REST API",
    leadText: "Use VeldrixAI from any language via direct HTTP calls to api.veldrixai.ca.",
    toc: [
      { id: "base-url", label: "Base URL" },
      { id: "auth", label: "Authentication" },
      { id: "evaluate-endpoint", label: "POST /analyze" },
      { id: "audit-endpoint", label: "GET /audit" },
    ],
    htmlContent: `
<h2 id="base-url">Base URL</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>https://api.veldrixai.ca/api/v1</code></pre></div>

<h2 id="auth">Authentication</h2>
<p>All API requests must include your API key in the <code>Authorization</code> header:</p>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>Authorization: Bearer vx_live_...</code></pre></div>

<h2 id="evaluate-endpoint">POST /analyze</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>POST https://api.veldrixai.ca/api/v1/analyze
Authorization: Bearer vx_live_...
Content-Type: application/json

{
  "prompt": "What medications is the patient taking?",
  "response": "The patient takes metformin 500mg twice daily.",
  "pillars": ["compliance", "safety"],
  "policy_id": "hipaa-strict",
  "mode": "inline"
}</code></pre></div>

<h2 id="audit-endpoint">GET /audit</h2>
<div class="cblk"><div class="cbh"><button class="cbcopy" aria-label="Copy code">Copy</button></div>
<pre><code>GET https://api.veldrixai.ca/api/v1/audit?limit=50&amp;action=block
Authorization: Bearer vx_live_...</code></pre></div>`,
  },

  "ref-enforcement": {
    id: "ref-enforcement",
    title: "Enforcement Actions Reference",
    leadText: "Complete reference for all seven enforcement actions and their behaviors.",
    toc: [{ id: "actions", label: "All actions" }],
    htmlContent: `
<h2 id="actions">All actions</h2>
<table>
  <thead><tr><th>Action</th><th>Priority</th><th>Effect</th><th>Delivery</th></tr></thead>
  <tbody>
    <tr><td><code>escalate</code></td><td>1</td><td>Route to human review queue</td><td>Held — not delivered</td></tr>
    <tr><td><code>block</code></td><td>2</td><td>Suppress response; return fallback</td><td>Blocked</td></tr>
    <tr><td><code>rewrite</code></td><td>3</td><td>Replace with policy-safe version</td><td>Modified response</td></tr>
    <tr><td><code>regenerate</code></td><td>4</td><td>Re-invoke LLM with adjusted prompt</td><td>New response</td></tr>
    <tr><td><code>mask</code></td><td>5</td><td>Redact PII entities in-place</td><td>Redacted response</td></tr>
    <tr><td><code>disclaimer</code></td><td>6</td><td>Append regulatory disclosure</td><td>Appended response</td></tr>
    <tr><td><code>allow</code></td><td>7</td><td>Pass through unchanged</td><td>Original response</td></tr>
  </tbody>
</table>
<div class="cl cl-info">When multiple violations occur in one request, the action with the lowest priority number wins.</div>`,
  },

  "ref-security": {
    id: "ref-security",
    title: "Security & Compliance",
    leadText: "VeldrixAI's security posture, certifications, and compliance capabilities.",
    toc: [
      { id: "certifications", label: "Certifications" },
      { id: "data-handling", label: "Data handling" },
      { id: "hipaa", label: "HIPAA" },
    ],
    htmlContent: `
<h2 id="certifications">Certifications</h2>
<ul>
  <li>SOC 2 Type II</li>
  <li>ISO 27001</li>
  <li>GDPR compliant</li>
  <li>NVIDIA Elite Partner</li>
</ul>

<h2 id="data-handling">Data handling</h2>
<p>Prompts and responses submitted for evaluation are processed in-memory and are not stored by default. Audit logs store metadata (scores, actions, principal IDs) but not raw prompt/response content unless you opt in.</p>

<h2 id="hipaa">HIPAA</h2>
<p>Enterprise customers can sign a HIPAA Business Associate Agreement (BAA). Contact <a href="mailto:sales@veldrixai.ca">sales@veldrixai.ca</a>.</p>`,
  },

  "ref-billing": {
    id: "ref-billing",
    title: "Billing Information",
    leadText: "Detailed billing terms, payment methods, and cancellation policy.",
    toc: [
      { id: "payment-methods", label: "Payment methods" },
      { id: "cancellation", label: "Cancellation policy" },
      { id: "refunds", label: "Refunds" },
    ],
    htmlContent: `
<h2 id="payment-methods">Payment methods</h2>
<p>VeldrixAI accepts all major credit and debit cards (Visa, Mastercard, Amex, Discover) via Stripe. Enterprise customers may arrange annual invoicing by contacting <a href="mailto:sales@veldrixai.ca">sales@veldrixai.ca</a>.</p>

<h2 id="cancellation">Cancellation policy</h2>
<p>You may cancel at any time from the billing portal. Access continues until the end of the current billing period. Audit logs are accessible for 30 days post-cancellation, then permanently purged.</p>

<h2 id="refunds">Refunds</h2>
<p>Monthly subscriptions are non-refundable. Annual subscriptions may be eligible for a prorated refund within 30 days of payment. Contact <a href="mailto:support@veldrixai.ca">support@veldrixai.ca</a>.</p>`,
  },
};

export function getDocPage(slug: string): DocPageContent | null {
  return DOC_PAGES[slug] ?? null;
}

export function getAllDocSlugs(): string[] {
  return Object.keys(DOC_PAGES);
}
