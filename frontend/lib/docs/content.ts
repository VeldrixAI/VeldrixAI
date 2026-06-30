// lib/docs/content.ts
// HTML content for all 37 VeldrixAI documentation pages.
//
// Authored from the live product surface (Python SDK `veldrixai`, the REST
// Trust Engine at https://api.veldrixai.ca, the Policy Engine, the append-only
// audit hash chain, and the billing plans). Keep examples in sync with the SDK:
//   - client class is `Veldrix`; API keys use dashes: vx-live-... / vx-test-...
//   - TrustResult.verdict is one of ALLOW | WARN | REVIEW | BLOCK
//   - scores are 0.0 (worst) → 1.0 (best) in the SDK; the REST API returns
//     final_score.value on a 0–100 scale.

export interface DocPageContent {
  id: string;
  title: string;
  leadText?: string;
  toc: Array<{ id: string; label: string }>;
  htmlContent: string;
}

const DOC_PAGES: Record<string, DocPageContent> = {
  // ─────────────────────────────────────────────────────────────────────────
  // GET STARTED
  // ─────────────────────────────────────────────────────────────────────────
  "welcome": {
    id: "welcome",
    title: "Welcome to VeldrixAI",
    leadText: "VeldrixAI is the runtime trust infrastructure layer for production AI systems — it evaluates every model output, enforces your governance policy, and writes a tamper-evident audit trail.",
    toc: [
      { id: "what-is-veldrixai", label: "What is VeldrixAI?" },
      { id: "why-it-matters", label: "Why it matters" },
      { id: "how-it-works", label: "How it works" },
      { id: "the-five-pillars", label: "The five pillars" },
      { id: "next-steps", label: "Next steps" },
    ],
    htmlContent: `
<h2 id="what-is-veldrixai">What is VeldrixAI?</h2>
<p>VeldrixAI sits between your AI application and your users. Every time your system produces a model response, VeldrixAI evaluates that response across five independent trust dimensions, aggregates the results against <em>your</em> policy, decides on an enforcement action, and records the decision in an immutable audit log.</p>
<p>Think of it as the control plane for AI behaviour: your LLM decides <strong>what</strong> to say, and VeldrixAI decides <strong>whether that output is allowed to ship</strong> — with the evidence to prove it later.</p>
<div class="cl cl-info"><strong>You are reading documentation for VeldrixAI v3.1.</strong> The REST API and Python SDK interfaces described here are stable.</div>

<h2 id="why-it-matters">Why it matters</h2>
<p>Foundation models are non-deterministic. The same prompt can return a safe answer today and a harmful, hallucinated, or non-compliant one tomorrow. For consumer apps that is a reputation risk; for regulated industries — healthcare, finance, legal, government — it is a compliance liability.</p>
<p>VeldrixAI gives you three things teams need to run AI in production with confidence:</p>
<div class="cards">
  <div class="card"><h4>Real-time guardrails</h4><p>Catch unsafe, hallucinated, biased, or PII-leaking output before it reaches a user.</p></div>
  <div class="card"><h4>Deterministic policy</h4><p>Encode your risk tolerance once. Every evaluation applies it identically and reproducibly.</p></div>
  <div class="card"><h4>Provable accountability</h4><p>A cryptographically chained audit trail your compliance and security teams will accept.</p></div>
</div>

<h2 id="how-it-works">How it works</h2>
<p>A single evaluation flows through the Trust Engine in four stages:</p>
<div class="steps">
  <div class="step"><span class="snum">1</span><p><strong>Intercept.</strong> You send the prompt + the model response to VeldrixAI (inline, or in the background so it never slows your app).</p></div>
  <div class="step"><span class="snum">2</span><p><strong>Evaluate.</strong> Five pillars run <em>in parallel</em> against the content, each returning a 0–1 score and any flags.</p></div>
  <div class="step"><span class="snum">3</span><p><strong>Decide.</strong> The Policy Engine aggregates pillar scores with your weights, compares against your thresholds, and resolves a verdict: <code>ALLOW</code>, <code>WARN</code>, <code>REVIEW</code>, or <code>BLOCK</code>.</p></div>
  <div class="step"><span class="snum">4</span><p><strong>Record.</strong> The full decision is written to your append-only audit trail and surfaced in the dashboard.</p></div>
</div>

<h2 id="the-five-pillars">The five pillars</h2>
<div class="cards">
  <div class="card"><h4>Safety &amp; Toxicity</h4><p>Harmful, violent, harassing, or self-harm-inducing content.</p></div>
  <div class="card"><h4>Hallucination Detection</h4><p>Fabricated facts, false citations, invented statistics.</p></div>
  <div class="card"><h4>Bias &amp; Fairness</h4><p>Discriminatory framing and demographic stereotyping.</p></div>
  <div class="card"><h4>Prompt Security</h4><p>Injection attacks, jailbreaks, and adversarial patterns.</p></div>
  <div class="card"><h4>Compliance &amp; PII</h4><p>Regulated data categories and personal-information disclosure.</p></div>
</div>

<h2 id="next-steps">Next steps</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Follow the <a href="/docs/quickstart">Quickstart</a> to run your first evaluation in under five minutes.</p></div>
  <div class="step"><span class="snum">2</span><p>Read <a href="/docs/concepts">Core Concepts</a> to understand trust scores, verdicts, pillars, and policies.</p></div>
  <div class="step"><span class="snum">3</span><p>Integrate via the <a href="/docs/integrations-python">Python SDK</a> or the <a href="/docs/integrations-rest">REST API</a>.</p></div>
</div>`,
  },

  "quickstart": {
    id: "quickstart",
    title: "Quickstart",
    leadText: "Install the SDK, get an API key, and make your first trust evaluation in under five minutes.",
    toc: [
      { id: "prerequisites", label: "Prerequisites" },
      { id: "install", label: "1. Install the SDK" },
      { id: "get-a-key", label: "2. Get an API key" },
      { id: "first-request", label: "3. Your first evaluation" },
      { id: "reading-results", label: "4. Reading the result" },
      { id: "guard-mode", label: "5. Guard your LLM calls" },
    ],
    htmlContent: `
<h2 id="prerequisites">Prerequisites</h2>
<ul>
  <li>Python 3.10+ (or any HTTP client for the <a href="/docs/integrations-rest">REST API</a>)</li>
  <li>A VeldrixAI account — <a href="https://app.veldrixai.ca">sign up free</a> (1,000 evaluations/month, no card required)</li>
</ul>

<h2 id="install">1. Install the SDK</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><span class="cbt" data-lang="typescript">Node</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>pip install veldrixai</code></pre>
  <pre data-lang="typescript" style="display:none"><code>npm install @veldrixai/sdk</code></pre>
</div>

<h2 id="get-a-key">2. Get an API key</h2>
<p>Create a key in the dashboard under <strong>Settings → API Keys</strong>. Keys are environment-scoped:</p>
<ul>
  <li><code>vx-live-...</code> — production traffic, counts against your quota.</li>
  <li><code>vx-test-...</code> — sandbox traffic for development.</li>
</ul>
<div class="cl cl-warn">Keys are shown only once at creation. Store them in a secret manager or environment variable — never commit them to source control.</div>

<h2 id="first-request">3. Your first evaluation</h2>
<p>Send a prompt and the model's response. VeldrixAI returns a <code>TrustResult</code>.</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><span class="cbt" data-lang="typescript">Node</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>import veldrixai

client = veldrixai.Veldrix(api_key="vx-live-...")

result = client.evaluate_sync(
    prompt="Summarize the patient's medical history.",
    response="John Smith (DOB 1985-03-12) has stage 2 hypertension.",
)

print(result.overall)         # 0.34   (0 = unsafe, 1 = safe)
print(result.verdict)         # "BLOCK"
print(result.pillar_scores)   # {"safety": 0.95, "compliance": 0.12, ...}
print(result.critical_flags)  # ["pii_detected"]</code></pre>
  <pre data-lang="typescript" style="display:none"><code>const res = await fetch("https://api.veldrixai.ca/trust/evaluate", {
  method: "POST",
  headers: {
    "Authorization": "Bearer vx-live-...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: "Summarize the patient's medical history.",
    response: "John Smith (DOB 1985-03-12) has stage 2 hypertension.",
    model: "gpt-4o",
  }),
});
const { data } = await res.json();
console.log(data.final_score.value);   // 34.0  (0–100 over REST)
console.log(data.final_score.risk_level);</code></pre>
</div>

<h2 id="reading-results">4. Reading the result</h2>
<p>The Python SDK normalises everything to a 0–1 scale where <strong>higher is safer</strong>.</p>
<table>
  <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
  <tbody>
    <tr><td><code>overall</code></td><td>float 0–1</td><td>Weighted aggregate trust score.</td></tr>
    <tr><td><code>verdict</code></td><td>string</td><td><code>ALLOW</code> · <code>WARN</code> · <code>REVIEW</code> · <code>BLOCK</code></td></tr>
    <tr><td><code>pillar_scores</code></td><td>dict</td><td>Per-pillar score, e.g. <code>{"safety": 0.95}</code>.</td></tr>
    <tr><td><code>critical_flags</code></td><td>list</td><td>Flags that force a hard block (injection, PII, etc.).</td></tr>
    <tr><td><code>request_id</code></td><td>string</td><td>Stable id; use it to look up the audit record.</td></tr>
    <tr><td><code>latency_ms</code></td><td>int</td><td>End-to-end evaluation latency.</td></tr>
  </tbody>
</table>

<h2 id="guard-mode">5. Guard your LLM calls</h2>
<p>For production, wrap your generation function with <code>@guard</code>. By default it evaluates in the background (zero added latency); set <code>block_on_verdict</code> to raise on dangerous output.</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>from veldrixai import Veldrix, GuardConfig

veldrix = Veldrix(api_key="vx-live-...")

@veldrix.guard(config=GuardConfig(block_on_verdict=["BLOCK"]))
def answer(prompt: str) -> str:
    return my_llm.complete(prompt)   # raises VeldrixBlocked if the output is BLOCK</code></pre>
</div>
<div class="cl cl-tip">Next: learn how scores become verdicts in <a href="/docs/concepts">Core Concepts</a>, or shape enforcement in the <a href="/docs/policy-overview">Policy Engine</a>.</div>`,
  },

  "concepts": {
    id: "concepts",
    title: "Core Concepts",
    leadText: "The mental model behind VeldrixAI: pillars produce scores, the policy turns scores into a verdict, and the audit trail records everything.",
    toc: [
      { id: "trust-score", label: "Trust score" },
      { id: "pillars", label: "Pillars" },
      { id: "verdicts", label: "Verdicts" },
      { id: "policy", label: "Policy" },
      { id: "modes", label: "Inline vs background" },
      { id: "audit", label: "Audit trail" },
    ],
    htmlContent: `
<h2 id="trust-score">Trust score</h2>
<p>Every evaluation produces an <strong>overall trust score</strong> from 0.0 to 1.0, where <strong>1.0 is fully trusted</strong> and 0.0 is maximally risky. It is a weighted aggregate of the individual pillar scores — not an average. You control the weights in your <a href="/docs/policy-weights">policy</a>.</p>
<div class="cl cl-info">Trust score is intentionally a single, comparable number. Use it for dashboards, alerting thresholds, and SLAs across every model and use case.</div>

<h2 id="pillars">Pillars</h2>
<p>A <strong>pillar</strong> is an independent evaluator for one risk dimension. VeldrixAI ships five, and each returns its own 0–1 score plus zero or more <strong>flags</strong> (machine-readable reasons such as <code>pii_detected</code> or <code>prompt_injection_detected</code>).</p>
<p>Pillars run concurrently, so adding pillars does not add latency. See the <a href="/docs/trust-overview">Trust Engine</a> section for each pillar in depth.</p>

<h2 id="verdicts">Verdicts</h2>
<p>The Policy Engine maps the overall score (and any hard-block flags) to one of four verdicts:</p>
<table>
  <thead><tr><th>Verdict</th><th>Default band</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>ALLOW</code></td><td>≥ 0.85</td><td>Output is trusted; ship it.</td></tr>
    <tr><td><code>WARN</code></td><td>0.60–0.85</td><td>Ship, but log a warning for review.</td></tr>
    <tr><td><code>REVIEW</code></td><td>0.40–0.60</td><td>Borderline; route to human review or a fallback.</td></tr>
    <tr><td><code>BLOCK</code></td><td>&lt; 0.40</td><td>Do not ship. Also forced by critical flags.</td></tr>
  </tbody>
</table>
<div class="cl cl-warn">Certain critical flags — prompt injection, explicit content, or a critical/high policy violation — force <code>BLOCK</code> regardless of the aggregate score. Safety is never averaged away.</div>

<h2 id="policy">Policy</h2>
<p>A <strong>policy</strong> is the deterministic ruleset that turns pillar scores into a verdict: the per-pillar <a href="/docs/policy-weights">weights and thresholds</a>. Policies are <a href="/docs/policy-versioning">versioned</a> and can run in <strong>shadow</strong> mode (observe only) before you switch them to <strong>active</strong> enforcement.</p>

<h2 id="modes">Inline vs background</h2>
<div class="cards">
  <div class="card"><h4>Inline (sync)</h4><p><code>evaluate_sync()</code> blocks until the verdict is ready. Use it when you must gate the response before returning it.</p></div>
  <div class="card"><h4>Background (async)</h4><p>The default for <code>@guard</code>. Your LLM response returns immediately; evaluation and logging happen out-of-band, adding zero user-facing latency.</p></div>
</div>

<h2 id="audit">Audit trail</h2>
<p>Every evaluation is written to an <strong>append-only, tamper-evident audit trail</strong>. Each record is cryptographically chained to the previous one per tenant, so any modification or deletion is detectable. See <a href="/docs/audit-trails">Audit Trails</a>.</p>`,
  },

  "manage-accounts": {
    id: "manage-accounts",
    title: "Manage accounts",
    leadText: "Organizations, members, roles, and workspace settings.",
    toc: [
      { id: "organizations", label: "Organizations" },
      { id: "members-roles", label: "Members & roles" },
      { id: "sso", label: "SSO / SAML" },
      { id: "switching", label: "Switching workspaces" },
    ],
    htmlContent: `
<h2 id="organizations">Organizations</h2>
<p>Your <strong>organization</strong> is the top-level container for billing, members, API keys, policies, and audit data. When you sign up you get a personal organization; invite teammates to collaborate in a shared workspace.</p>

<h2 id="members-roles">Members &amp; roles</h2>
<p>Invite members from <strong>Settings → Members</strong>. Each member holds one role:</p>
<table>
  <thead><tr><th>Role</th><th>Can do</th></tr></thead>
  <tbody>
    <tr><td><strong>Owner</strong></td><td>Everything, including billing and deleting the organization.</td></tr>
    <tr><td><strong>Admin</strong></td><td>Manage members, API keys, and policies. No billing changes.</td></tr>
    <tr><td><strong>Member</strong></td><td>Create keys, run evaluations, view audit trails and reports.</td></tr>
    <tr><td><strong>Viewer</strong></td><td>Read-only access to dashboards, audit trails, and reports.</td></tr>
  </tbody>
</table>
<div class="cl cl-info">Audit records always capture the acting member's identity, so every decision is attributable.</div>

<h2 id="sso">SSO / SAML</h2>
<p>Single sign-on via SAML 2.0 (Okta, Azure AD, Google Workspace) is available on the <a href="/docs/billing-plans">Scale and Enterprise plans</a>. Configure it under <strong>Settings → Security → SSO</strong>.</p>

<h2 id="switching">Switching workspaces</h2>
<p>If you belong to multiple organizations, use the workspace switcher in the top-left of the dashboard. API keys and audit data are isolated per organization.</p>`,
  },

  "api-keys": {
    id: "api-keys",
    title: "Manage API keys",
    leadText: "Create, scope, rotate, and revoke the keys that authenticate your requests.",
    toc: [
      { id: "key-types", label: "Key types" },
      { id: "creating", label: "Creating a key" },
      { id: "using", label: "Using a key" },
      { id: "rotating", label: "Rotating & revoking" },
      { id: "security", label: "Security best practices" },
    ],
    htmlContent: `
<h2 id="key-types">Key types</h2>
<table>
  <thead><tr><th>Prefix</th><th>Environment</th><th>Counts against quota?</th></tr></thead>
  <tbody>
    <tr><td><code>vx-live-</code></td><td>Production</td><td>Yes</td></tr>
    <tr><td><code>vx-test-</code></td><td>Sandbox / development</td><td>No</td></tr>
  </tbody>
</table>
<div class="cl cl-warn">The SDK validates the prefix and rejects keys that use underscores. The format is <code>vx-live-</code> with dashes, not <code>vx_live_</code>.</div>

<h2 id="creating">Creating a key</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Open <strong>Settings → API Keys</strong> in the dashboard.</p></div>
  <div class="step"><span class="snum">2</span><p>Click <strong>Create key</strong>, give it a descriptive name (e.g. <em>prod-backend</em>), and choose the environment.</p></div>
  <div class="step"><span class="snum">3</span><p>Copy the key immediately — only a short prefix is stored and shown afterward.</p></div>
</div>

<h2 id="using">Using a key</h2>
<p>Pass it to the SDK, or send it as a bearer token over REST. Prefer environment variables over hard-coding.</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><span class="cbt" data-lang="bash">REST</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>import veldrixai, os

# Reads VELDRIX_API_KEY from the environment
client = veldrixai.Veldrix.from_env()
# or explicitly:
client = veldrixai.Veldrix(api_key=os.environ["VELDRIX_API_KEY"])</code></pre>
  <pre data-lang="bash" style="display:none"><code>curl https://api.veldrixai.ca/trust/evaluate \\
  -H "Authorization: Bearer $VELDRIX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"...","response":"...","model":"gpt-4o"}'</code></pre>
</div>

<h2 id="rotating">Rotating &amp; revoking</h2>
<p>Rotate keys on a schedule and whenever a key may have been exposed. Create the new key, deploy it, then revoke the old one from the dashboard — revocation takes effect immediately. Each key shows a last-used timestamp to help you spot stale credentials.</p>

<h2 id="security">Security best practices</h2>
<ul>
  <li>Use a dedicated key per service so you can revoke narrowly.</li>
  <li>Never expose <code>vx-live-</code> keys in browser/client-side code — call VeldrixAI from your backend.</li>
  <li>Store keys in a secret manager (AWS Secrets Manager, Vault, Doppler), not in <code>.env</code> committed to git.</li>
</ul>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRUST ENGINE
  // ─────────────────────────────────────────────────────────────────────────
  "trust-overview": {
    id: "trust-overview",
    title: "Trust Engine Overview",
    leadText: "The Trust Engine runs five evaluation pillars in parallel against every model output and returns a single, policy-weighted verdict.",
    toc: [
      { id: "architecture", label: "Architecture" },
      { id: "pillars", label: "The pillars" },
      { id: "scoring", label: "Scoring model" },
      { id: "latency", label: "Latency tiers" },
      { id: "grounded", label: "Grounded evaluation" },
    ],
    htmlContent: `
<h2 id="architecture">Architecture</h2>
<p>The Trust Engine is a stateless evaluation service. For each request it:</p>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Tokenizes and preprocesses the prompt + response pair.</p></div>
  <div class="step"><span class="snum">2</span><p>Dispatches all five pillars <strong>concurrently</strong> under a shared latency budget.</p></div>
  <div class="step"><span class="snum">3</span><p>Aggregates pillar scores using your policy weights.</p></div>
  <div class="step"><span class="snum">4</span><p>Resolves the verdict from your thresholds (plus any hard-block flags).</p></div>
  <div class="step"><span class="snum">5</span><p>Returns the result and emits an audit record.</p></div>
</div>

<h2 id="pillars">The pillars</h2>
<div class="cards">
  <div class="card"><h4><a href="/docs/trust-safety">Safety &amp; Toxicity</a></h4><p>Harmful, violent, harassing, self-harm content.</p></div>
  <div class="card"><h4><a href="/docs/trust-hallucination">Hallucination</a></h4><p>Fabricated facts and citations.</p></div>
  <div class="card"><h4><a href="/docs/trust-bias">Bias &amp; Fairness</a></h4><p>Stereotyping and discriminatory framing.</p></div>
  <div class="card"><h4><a href="/docs/trust-prompt-security">Prompt Security</a></h4><p>Injection and jailbreak detection.</p></div>
  <div class="card"><h4><a href="/docs/trust-compliance">Compliance &amp; PII</a></h4><p>Regulated data and personal information.</p></div>
</div>

<h2 id="scoring">Scoring model</h2>
<p>Each pillar emits a score in [0,1] and a confidence value. The overall trust score is the weighted aggregate of pillar scores. Because weighting is deterministic, the same input and policy version always produce the same verdict — essential for reproducible audits.</p>

<h2 id="latency">Latency tiers</h2>
<p>You choose an SLA tier per request via the <code>x-veldrix-sla-tier</code> header (or your plan default). Per-pillar work is generous, but the <strong>total budget</strong> is the hard deadline:</p>
<table>
  <thead><tr><th>Tier</th><th>p95 budget</th><th>Use for</th></tr></thead>
  <tbody>
    <tr><td><code>REALTIME</code></td><td>≤ 200 ms</td><td>Interactive, user-blocking calls.</td></tr>
    <tr><td><code>STANDARD</code></td><td>≤ 500 ms</td><td>Default for most traffic.</td></tr>
    <tr><td><code>BACKGROUND</code></td><td>uncapped</td><td>Batch / fire-and-forget logging.</td></tr>
  </tbody>
</table>
<div class="cl cl-tip">Run evaluations in <a href="/docs/concepts">background mode</a> and the tier never touches your user-facing latency at all.</div>

<h2 id="grounded">Grounded evaluation</h2>
<p>Pass source context (retrieved documents, system instructions) in the <code>context</code> field and pillars evaluate the response <em>against that ground truth</em> — sharply reducing hallucination false-positives versus context-free checking.</p>`,
  },

  "trust-safety": {
    id: "trust-safety",
    title: "Safety & Toxicity",
    leadText: "Detects harmful, violent, harassing, sexual, and self-harm-inducing content before it reaches a user.",
    toc: [
      { id: "what-it-catches", label: "What it catches" },
      { id: "flags", label: "Flags" },
      { id: "example", label: "Example" },
      { id: "tuning", label: "Tuning" },
    ],
    htmlContent: `
<h2 id="what-it-catches">What it catches</h2>
<p>The Safety pillar uses multi-stage semantic detection — zero-shot classifiers backed by the inference layer — to score how likely a response is to cause harm. It covers:</p>
<ul>
  <li>Violence, threats, and incitement</li>
  <li>Harassment and hate speech</li>
  <li>Sexual and explicit content</li>
  <li>Self-harm and dangerous instructions (weapons, illicit synthesis)</li>
</ul>

<h2 id="flags">Flags</h2>
<table>
  <thead><tr><th>Flag</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>content_unsafe</code></td><td>General unsafe content detected.</td></tr>
    <tr><td><code>explicit_content_detected</code></td><td>Sexual/explicit material — forces <code>BLOCK</code>.</td></tr>
    <tr><td><code>self_harm</code></td><td>Self-harm encouragement or instructions.</td></tr>
  </tbody>
</table>
<div class="cl cl-warn"><code>explicit_content_detected</code> is a critical flag and forces a hard block regardless of the aggregate score.</div>

<h2 id="example">Example</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>r = client.evaluate_sync(prompt=prompt, response=model_output)
if r.pillar_scores["safety"] &lt; 0.5:
    print("Unsafe:", r.critical_flags)</code></pre>
</div>

<h2 id="tuning">Tuning</h2>
<p>Raise the safety <a href="/docs/policy-weights">weight</a> for consumer-facing or youth audiences; lower the review threshold if your domain legitimately discusses sensitive topics (e.g. clinical or security research) to reduce false positives.</p>`,
  },

  "trust-hallucination": {
    id: "trust-hallucination",
    title: "Hallucination Detection",
    leadText: "Estimates factual confidence and flags fabricated facts, false citations, and invented statistics.",
    toc: [
      { id: "how", label: "How it works" },
      { id: "grounded", label: "Grounded vs ungrounded" },
      { id: "flags", label: "Flags" },
      { id: "example", label: "Example" },
    ],
    htmlContent: `
<h2 id="how">How it works</h2>
<p>The Hallucination pillar measures how well a response is supported by evidence. It analyses factual claims, citation validity, and internal consistency, producing a confidence score where a low value means the output is likely fabricated.</p>

<h2 id="grounded">Grounded vs ungrounded</h2>
<p>Detection is dramatically more accurate when you provide the source material the model was supposed to use. Pass it in <code>context</code>:</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>r = client.evaluate_sync(
    prompt="What was Q3 revenue?",
    response="Q3 revenue was $4.2M, up 30% YoY.",
    metadata={"context": retrieved_docs},   # ground truth for the check
)
print(r.pillar_scores["hallucination"])</code></pre>
</div>
<div class="cl cl-tip">Grounded evaluation reduces hallucination false-positives by 60–80% compared with context-free checking — ideal for RAG pipelines.</div>

<h2 id="flags">Flags</h2>
<table>
  <thead><tr><th>Flag</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>uncertain_claims</code></td><td>Claims with low factual confidence (informational).</td></tr>
    <tr><td><code>fabricated_citation</code></td><td>A cited source that does not support the claim.</td></tr>
    <tr><td><code>unsupported_statistic</code></td><td>A number with no basis in the provided context.</td></tr>
  </tbody>
</table>

<h2 id="example">Example</h2>
<p>Use the hallucination score to gate RAG answers: below your threshold, fall back to "I don't have enough information" instead of shipping a confident-but-wrong answer.</p>`,
  },

  "trust-bias": {
    id: "trust-bias",
    title: "Bias & Fairness",
    leadText: "Identifies discriminatory framing and demographic stereotyping, and records every verdict for regulatory transparency.",
    toc: [
      { id: "what", label: "What it detects" },
      { id: "dimensions", label: "Protected dimensions" },
      { id: "flags", label: "Flags" },
      { id: "compliance", label: "Why it matters for compliance" },
    ],
    htmlContent: `
<h2 id="what">What it detects</h2>
<p>The Bias pillar evaluates whether a response treats people or groups unfairly — through stereotyping, loaded framing, unequal assumptions, or discriminatory recommendations.</p>

<h2 id="dimensions">Protected dimensions</h2>
<ul>
  <li>Race, ethnicity, and nationality</li>
  <li>Gender and gender identity</li>
  <li>Age, disability, and religion</li>
  <li>Sexual orientation and socioeconomic status</li>
</ul>

<h2 id="flags">Flags</h2>
<table>
  <thead><tr><th>Flag</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>stereotyping</code></td><td>Generalized assumptions about a group.</td></tr>
    <tr><td><code>discriminatory_framing</code></td><td>Unequal or prejudicial framing of a topic.</td></tr>
  </tbody>
</table>

<h2 id="compliance">Why it matters for compliance</h2>
<p>For hiring, lending, housing, and insurance use cases, demonstrable fairness controls are increasingly required (EEOC, EU AI Act). Every bias verdict is written to the <a href="/docs/audit-trails">audit trail</a>, giving you defensible evidence that fairness was actively checked on each output.</p>`,
  },

  "trust-prompt-security": {
    id: "trust-prompt-security",
    title: "Prompt Security",
    leadText: "Detects prompt injection, jailbreak attempts, and adversarial patterns that try to subvert your system instructions.",
    toc: [
      { id: "threats", label: "Threats covered" },
      { id: "flags", label: "Flags" },
      { id: "hard-block", label: "Hard block behaviour" },
      { id: "example", label: "Example" },
    ],
    htmlContent: `
<h2 id="threats">Threats covered</h2>
<ul>
  <li><strong>Direct injection</strong> — "ignore previous instructions and…"</li>
  <li><strong>Indirect injection</strong> — malicious instructions hidden in retrieved documents or tool output</li>
  <li><strong>Jailbreaks</strong> — role-play and persona attacks ("DAN", "developer mode")</li>
  <li><strong>Exfiltration</strong> — attempts to leak the system prompt or secrets</li>
</ul>

<h2 id="flags">Flags</h2>
<table>
  <thead><tr><th>Flag</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>prompt_injection_detected</code></td><td>Injection/override attempt — forces <code>BLOCK</code>.</td></tr>
    <tr><td><code>jailbreak_attempt</code></td><td>Known jailbreak pattern detected.</td></tr>
    <tr><td><code>system_prompt_leak</code></td><td>Response reveals protected instructions.</td></tr>
  </tbody>
</table>

<h2 id="hard-block">Hard block behaviour</h2>
<div class="cl cl-danger"><code>prompt_injection_detected</code> is a critical flag: the verdict is <code>BLOCK</code> even if every other pillar scores perfectly. Injection is treated as a security event, not a quality issue.</div>

<h2 id="example">Example</h2>
<p>Evaluate <em>both</em> the user prompt and the final response — injection often lives in the input. For agents, also evaluate tool output before the model consumes it (see <a href="/docs/agent-tool-interception">Tool Interception</a>).</p>`,
  },

  "trust-compliance": {
    id: "trust-compliance",
    title: "Compliance & PII",
    leadText: "Scans for personally identifiable information and regulated data categories, and supports automatic redaction before logging.",
    toc: [
      { id: "what", label: "What it detects" },
      { id: "categories", label: "PII categories" },
      { id: "redaction", label: "Redaction" },
      { id: "frameworks", label: "Regulatory frameworks" },
    ],
    htmlContent: `
<h2 id="what">What it detects</h2>
<p>The Compliance pillar combines pattern matching with named-entity recognition to find personal and regulated data in a response, scoring the disclosure risk.</p>

<h2 id="categories">PII categories</h2>
<table>
  <thead><tr><th>Category</th><th>Examples</th></tr></thead>
  <tbody>
    <tr><td>Identity</td><td>Names, dates of birth, national IDs, SSNs</td></tr>
    <tr><td>Contact</td><td>Email, phone, postal address</td></tr>
    <tr><td>Financial</td><td>Card numbers, bank accounts, IBANs</td></tr>
    <tr><td>Health (PHI)</td><td>Diagnoses, medications, record numbers</td></tr>
    <tr><td>Credentials</td><td>API keys, passwords, tokens</td></tr>
  </tbody>
</table>

<h2 id="redaction">Redaction</h2>
<p>When PII is detected you can redact it before the response is stored or returned. The <code>pii_detected</code> flag lists the categories found so you can mask precisely.</p>
<div class="cl cl-info">VeldrixAI never persists raw PII in the audit trail — only the detection metadata (categories and counts), so the log itself is safe to retain.</div>

<h2 id="frameworks">Regulatory frameworks</h2>
<p>The compliance pillar maps to the obligations in <strong>GDPR</strong>, <strong>HIPAA</strong>, <strong>CCPA/CPRA</strong>, and <strong>PCI-DSS</strong>. Pair it with the <a href="/docs/audit-trails">audit trail</a> to evidence that every output was screened for regulated data.</p>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // POLICY ENGINE
  // ─────────────────────────────────────────────────────────────────────────
  "policy-overview": {
    id: "policy-overview",
    title: "Policy Engine Overview",
    leadText: "The Policy Engine is the deterministic ruleset that turns pillar scores into enforcement decisions — versioned, testable, and safe to roll out.",
    toc: [
      { id: "what", label: "What a policy is" },
      { id: "shadow-active", label: "Shadow vs active" },
      { id: "rollout", label: "Safe rollout" },
      { id: "anatomy", label: "Anatomy of a policy" },
    ],
    htmlContent: `
<h2 id="what">What a policy is</h2>
<p>A policy is a deterministic function: <em>pillar scores + flags → verdict</em>. It is defined by per-pillar <a href="/docs/policy-weights">weights and thresholds</a> and is fully reproducible — the same inputs and policy version always yield the same decision.</p>

<h2 id="shadow-active">Shadow vs active</h2>
<div class="cards">
  <div class="card"><h4>Shadow (default)</h4><p>The policy is evaluated and <em>logged</em>, but no enforcement action is taken. Use it to measure impact on real traffic with zero risk.</p></div>
  <div class="card"><h4>Active</h4><p>The policy is enforced: <code>BLOCK</code> verdicts stop output, <code>REVIEW</code> routes to your fallback, and so on.</p></div>
</div>
<div class="cl cl-info">New policies start in shadow mode by default. Nothing you create can affect production traffic until you explicitly promote it.</div>

<h2 id="rollout">Safe rollout</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Create the policy and let it run in shadow against live traffic.</p></div>
  <div class="step"><span class="snum">2</span><p>Review the would-be verdicts in the dashboard — check false-positive rate and blocked volume.</p></div>
  <div class="step"><span class="snum">3</span><p>Tune weights and thresholds, then promote to active enforcement.</p></div>
  <div class="step"><span class="snum">4</span><p>Roll back instantly to a prior <a href="/docs/policy-versioning">version</a> if needed.</p></div>
</div>

<h2 id="anatomy">Anatomy of a policy</h2>
<ul>
  <li><strong>Weights</strong> — how much each pillar contributes to the overall score.</li>
  <li><strong>Thresholds</strong> — the score bands that map to <code>ALLOW</code>/<code>WARN</code>/<code>REVIEW</code>/<code>BLOCK</code>.</li>
  <li><strong>Hard-block flags</strong> — flags that force <code>BLOCK</code> regardless of score.</li>
  <li><strong>Mode</strong> — shadow or active.</li>
</ul>`,
  },

  "policy-create": {
    id: "policy-create",
    title: "Create a policy",
    leadText: "Define a custom governance policy in the dashboard or via the API.",
    toc: [
      { id: "dashboard", label: "In the dashboard" },
      { id: "starting-point", label: "Starting from a template" },
      { id: "test", label: "Test before promoting" },
    ],
    htmlContent: `
<h2 id="dashboard">In the dashboard</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Go to <strong>Policy Engine → Policies → New policy</strong>.</p></div>
  <div class="step"><span class="snum">2</span><p>Name it and pick the audiences/use cases it applies to.</p></div>
  <div class="step"><span class="snum">3</span><p>Set per-pillar <a href="/docs/policy-weights">weights and thresholds</a>.</p></div>
  <div class="step"><span class="snum">4</span><p>Save — the policy is created in <strong>shadow</strong> mode.</p></div>
</div>

<h2 id="starting-point">Starting from a template</h2>
<p>VeldrixAI ships opinionated starting points you can clone and tune:</p>
<table>
  <thead><tr><th>Template</th><th>Optimized for</th></tr></thead>
  <tbody>
    <tr><td><strong>Balanced</strong></td><td>General-purpose apps; even pillar weighting.</td></tr>
    <tr><td><strong>Consumer-safe</strong></td><td>High safety + bias weighting for public audiences.</td></tr>
    <tr><td><strong>Healthcare</strong></td><td>Maximizes Compliance/PII and hallucination control.</td></tr>
    <tr><td><strong>Finance</strong></td><td>Emphasizes compliance, accuracy, and prompt security.</td></tr>
  </tbody>
</table>

<h2 id="test">Test before promoting</h2>
<p>Use a <code>vx-test-</code> key to replay representative prompts against the new policy, confirm the verdicts match your intent, then promote it to active. See <a href="/docs/policy-versioning">Policy versioning</a> for promotion and rollback.</p>
<div class="cl cl-tip">Keep one policy per risk profile rather than one giant policy with exceptions — smaller policies are easier to reason about and audit.</div>`,
  },

  "policy-weights": {
    id: "policy-weights",
    title: "Weights & thresholds",
    leadText: "Control exactly how pillar scores combine into an overall score and how that score maps to a verdict.",
    toc: [
      { id: "weights", label: "Weights" },
      { id: "thresholds", label: "Thresholds" },
      { id: "hard-block", label: "Hard-block flags" },
      { id: "example", label: "Worked example" },
    ],
    htmlContent: `
<h2 id="weights">Weights</h2>
<p>Each pillar has a weight. The overall trust score is the weighted aggregate of the pillar scores, so weights express what your application cares about most. A healthcare policy might weight Compliance heavily; a public chatbot might weight Safety and Bias.</p>
<div class="cl cl-info">Weights are normalized internally, so you can use any relative numbers — what matters is the ratio between pillars.</div>

<h2 id="thresholds">Thresholds</h2>
<p>Thresholds define the score bands for each verdict. The defaults are:</p>
<table>
  <thead><tr><th>Verdict</th><th>Default threshold (overall score)</th></tr></thead>
  <tbody>
    <tr><td><code>ALLOW</code></td><td>≥ 0.85</td></tr>
    <tr><td><code>WARN</code></td><td>≥ 0.60</td></tr>
    <tr><td><code>REVIEW</code></td><td>≥ 0.40</td></tr>
    <tr><td><code>BLOCK</code></td><td>&lt; 0.40</td></tr>
  </tbody>
</table>
<p>Raise thresholds to be stricter (more output routed to review/block); lower them to be more permissive.</p>

<h2 id="hard-block">Hard-block flags</h2>
<p>Independently of score, you can designate flags that always force <code>BLOCK</code>. By default these include <code>prompt_injection_detected</code>, <code>explicit_content_detected</code>, and critical/high policy violations.</p>

<h2 id="example">Worked example</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="text">Example</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="text"><code>Weights:  safety 3 · compliance 3 · hallucination 2 · prompt_security 2 · bias 1
Scores:   safety 0.95 · compliance 0.20 · hallucination 0.90 · prompt_security 0.99 · bias 0.92

Overall  = (3*0.95 + 3*0.20 + 2*0.90 + 2*0.99 + 1*0.92) / 11 = 0.66  -> WARN
But compliance flagged pii_detected (hard-block) -> final verdict BLOCK</code></pre>
</div>`,
  },

  "policy-versioning": {
    id: "policy-versioning",
    title: "Policy versioning",
    leadText: "Every change to a policy creates an immutable version, so you can promote, roll back, and prove exactly which rules applied to any past decision.",
    toc: [
      { id: "versions", label: "Immutable versions" },
      { id: "promote-rollback", label: "Promote & roll back" },
      { id: "audit-link", label: "Linkage to the audit trail" },
    ],
    htmlContent: `
<h2 id="versions">Immutable versions</h2>
<p>Editing a policy never mutates the running rules. Instead it produces a new, immutable version with a unique id. Old versions are retained so historical decisions remain explainable.</p>

<h2 id="promote-rollback">Promote &amp; roll back</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p><strong>Promote</strong> a shadow version to active when you're satisfied with its shadow results.</p></div>
  <div class="step"><span class="snum">2</span><p>Only one version of a policy is active at a time per binding.</p></div>
  <div class="step"><span class="snum">3</span><p><strong>Roll back</strong> by re-activating any previous version — the switch is atomic and immediate.</p></div>
</div>
<div class="cl cl-tip">Because promotion is just a pointer change, rollback during an incident is instant and risk-free.</div>

<h2 id="audit-link">Linkage to the audit trail</h2>
<p>Each audit record references the exact policy version that produced its verdict. When an auditor asks "why was this output blocked in March?", you can show the precise rules in force at that moment — not today's rules.</p>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AGENT GUARD
  // ─────────────────────────────────────────────────────────────────────────
  "agent-overview": {
    id: "agent-overview",
    title: "Agent Guard Overview",
    leadText: "Bring VeldrixAI's trust evaluation to autonomous agents — guard every model output and tool call across the popular agent frameworks.",
    toc: [
      { id: "why", label: "Why agents need guarding" },
      { id: "surfaces", label: "What gets evaluated" },
      { id: "integrations", label: "Framework integrations" },
      { id: "decorator", label: "The guard decorator" },
    ],
    htmlContent: `
<h2 id="why">Why agents need guarding</h2>
<p>Agents chain many model calls and tool invocations, so a single bad step can compound. Indirect prompt injection through tool output is the canonical agent attack. Agent Guard evaluates each step so a compromised or hallucinated intermediate result is caught before it propagates.</p>

<h2 id="surfaces">What gets evaluated</h2>
<ul>
  <li><strong>Model outputs</strong> — every LLM completion in the agent loop.</li>
  <li><strong>Tool inputs/outputs</strong> — data returned by tools and retrieval, before the model consumes it (see <a href="/docs/agent-tool-interception">Tool Interception</a>).</li>
  <li><strong>Final answers</strong> — the response delivered to the user.</li>
</ul>

<h2 id="integrations">Framework integrations</h2>
<div class="cards">
  <div class="card"><h4><a href="/docs/agent-langchain">LangChain</a></h4><p>Callback handler that guards chains and agents.</p></div>
  <div class="card"><h4><a href="/docs/agent-crewai">CrewAI</a></h4><p>Guard crew tasks and agent steps.</p></div>
  <div class="card"><h4><a href="/docs/agent-autogen">AutoGen</a> <span class="docs-badge docs-badge-beta">Beta</span></h4><p>Guard multi-agent conversations.</p></div>
  <div class="card"><h4><a href="/docs/agent-tool-interception">Tool Interception</a></h4><p>Screen tool I/O framework-agnostically.</p></div>
</div>

<h2 id="decorator">The guard decorator</h2>
<p>The simplest integration works anywhere — wrap any function that returns model text:</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>from veldrixai import Veldrix, GuardConfig

veldrix = Veldrix(api_key="vx-live-...")

@veldrix.guard(config=GuardConfig(block_on_verdict=["BLOCK"]))
def agent_step(prompt: str) -> str:
    return llm.invoke(prompt)</code></pre>
</div>`,
  },

  "agent-langchain": {
    id: "agent-langchain",
    title: "LangChain",
    leadText: "Guard LangChain chains and agents with a drop-in callback handler.",
    toc: [
      { id: "install", label: "Install" },
      { id: "callback", label: "Callback handler" },
      { id: "block", label: "Blocking on verdict" },
    ],
    htmlContent: `
<h2 id="install">Install</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>pip install veldrixai langchain</code></pre>
</div>

<h2 id="callback">Callback handler</h2>
<p>Attach the VeldrixAI callback to any chain or agent. It evaluates each LLM output as it is produced and logs the verdict to your audit trail.</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>from veldrixai.adapters.langchain import VeldrixCallbackHandler

handler = VeldrixCallbackHandler(api_key="vx-live-...", block_on_verdict=["BLOCK"])

chain.invoke({"input": user_query}, config={"callbacks": [handler]})</code></pre>
</div>

<h2 id="block">Blocking on verdict</h2>
<p>With <code>block_on_verdict=["BLOCK"]</code> the handler raises when an output is blocked, halting the chain so the unsafe text never reaches the next step or the user. Catch the exception to return a safe fallback.</p>
<div class="cl cl-info">Prefer background evaluation for high-throughput chains where you want logging without added latency; switch to blocking only on the user-facing final step.</div>`,
  },

  "agent-crewai": {
    id: "agent-crewai",
    title: "CrewAI",
    leadText: "Guard CrewAI agents and tasks so every step in a crew is evaluated.",
    toc: [
      { id: "install", label: "Install" },
      { id: "wrap", label: "Guarding tasks" },
      { id: "notes", label: "Notes" },
    ],
    htmlContent: `
<h2 id="install">Install</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>pip install veldrixai crewai</code></pre>
</div>

<h2 id="wrap">Guarding tasks</h2>
<p>Wrap the callable a CrewAI agent uses to produce output with the <a href="/docs/agent-overview">guard decorator</a>, or evaluate task results explicitly before passing them downstream:</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>from veldrixai import Veldrix
veldrix = Veldrix(api_key="vx-live-...")

result = task.execute()
trust = veldrix.evaluate_sync(prompt=task.description, response=str(result))
if trust.verdict == "BLOCK":
    result = "[blocked by policy]"</code></pre>
</div>

<h2 id="notes">Notes</h2>
<p>Evaluate the output of each agent in a multi-agent crew, especially any agent that consumes external tool or web data — that is where indirect injection enters.</p>`,
  },

  "agent-autogen": {
    id: "agent-autogen",
    title: "AutoGen",
    leadText: "Guard Microsoft AutoGen multi-agent conversations.",
    toc: [
      { id: "status", label: "Beta status" },
      { id: "install", label: "Install" },
      { id: "usage", label: "Usage" },
    ],
    htmlContent: `
<div class="cl cl-info">The AutoGen integration is in <strong>Beta</strong>. The API may change; pin your SDK version and watch the <a href="/docs/welcome">changelog</a>.</div>

<h2 id="status">Beta status</h2>
<p>AutoGen support guards messages exchanged between agents so unsafe or injected content is caught mid-conversation rather than only at the end.</p>

<h2 id="install">Install</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>pip install veldrixai pyautogen</code></pre>
</div>

<h2 id="usage">Usage</h2>
<p>Register a reply hook that evaluates each agent message and blocks or annotates it according to your policy:</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>from veldrixai import Veldrix
veldrix = Veldrix(api_key="vx-live-...")

def guarded_reply(recipient, messages, sender, config):
    last = messages[-1]["content"]
    trust = veldrix.evaluate_sync(prompt="", response=last)
    if trust.verdict == "BLOCK":
        return True, "[message blocked by VeldrixAI policy]"
    return False, None

assistant.register_reply([Agent, None], guarded_reply)</code></pre>
</div>`,
  },

  "agent-tool-interception": {
    id: "agent-tool-interception",
    title: "Tool Interception",
    leadText: "Screen the data flowing in and out of agent tools — the primary vector for indirect prompt injection.",
    toc: [
      { id: "why", label: "The threat" },
      { id: "pattern", label: "Interception pattern" },
      { id: "http", label: "HTTP interceptor" },
    ],
    htmlContent: `
<h2 id="why">The threat</h2>
<p>When an agent fetches a web page, queries a database, or reads a document, that content is fed straight back into the model. Attackers plant instructions in those sources ("indirect injection"). Tool interception evaluates tool output <em>before</em> the model sees it.</p>

<h2 id="pattern">Interception pattern</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>def safe_tool(query: str) -> str:
    raw = real_tool(query)
    trust = veldrix.evaluate_sync(prompt=query, response=raw)
    if "prompt_injection_detected" in trust.critical_flags:
        return "[tool output withheld: injection detected]"
    return raw</code></pre>
</div>

<h2 id="http">HTTP interceptor</h2>
<p>For provider SDKs (OpenAI, Anthropic), the SDK includes an HTTP interceptor that can transparently evaluate completions at the transport layer, so you don't have to wrap every call site. See the <a href="/docs/integrations-python">Python SDK</a> reference for <code>http_interceptor</code> and the FastAPI/Flask middleware.</p>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT & COMPLIANCE
  // ─────────────────────────────────────────────────────────────────────────
  "audit-trails": {
    id: "audit-trails",
    title: "Audit Trails",
    leadText: "An append-only, cryptographically chained record of every evaluation — tamper-evident by design.",
    toc: [
      { id: "what", label: "What gets logged" },
      { id: "hash-chain", label: "The hash chain" },
      { id: "tamper", label: "Tamper-evidence" },
      { id: "query", label: "Querying & export" },
      { id: "intelligence", label: "AI Risk Thesis" },
    ],
    htmlContent: `
<h2 id="what">What gets logged</h2>
<p>Each evaluation writes one audit record containing the verdict, overall score, per-pillar scores, flags, the policy version applied, the acting identity, a timestamp, and a request id. Raw prompts/responses and PII are <em>not</em> stored — only the metadata needed to explain the decision.</p>

<h2 id="hash-chain">The hash chain</h2>
<p>Records are chained per tenant. Every record stores the hash of the previous record plus its own content hash and a sequence number:</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="text">Chain</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="text"><code>record_hash(n) = H( prev_hash(n-1) + action_type + entity + user + request_id + created_at + metadata )</code></pre>
</div>
<p>Because each link depends on the one before it, the whole history is verifiable from the genesis record forward.</p>

<h2 id="tamper">Tamper-evidence</h2>
<div class="cl cl-info">There is deliberately <strong>no delete endpoint</strong>. A database trigger blocks <code>UPDATE</code> and <code>DELETE</code> on audit records even at the SQL level. Any attempt to alter history breaks the chain and is immediately detectable by the chain-health check.</div>
<p>The dashboard surfaces a continuous chain-health indicator; an auditor can independently re-compute the chain to confirm integrity.</p>

<h2 id="query">Querying &amp; export</h2>
<p>Filter audit trails by verdict, action type, date, and request id in the dashboard, or export to CSV for your SIEM/GRC tooling. Look up any record by the <code>request_id</code> returned from an evaluation.</p>

<h2 id="intelligence">AI Risk Thesis</h2>
<p>For any record you can generate an <strong>AI Risk Thesis</strong> — a forensic, plain-language analysis of why the evaluation resolved the way it did, which pillar drove the risk, and recommended actions. See <a href="/docs/audit-reports">PDF Reports</a>.</p>`,
  },

  "audit-reports": {
    id: "audit-reports",
    title: "PDF Reports",
    leadText: "Generate shareable, signed compliance reports — including an AI-written forensic risk thesis — from any evaluation or time range.",
    toc: [
      { id: "what", label: "What's in a report" },
      { id: "generate", label: "Generating a report" },
      { id: "thesis", label: "AI Risk Thesis" },
      { id: "integrity", label: "Integrity" },
    ],
    htmlContent: `
<h2 id="what">What's in a report</h2>
<ul>
  <li>Executive summary with overall trust posture</li>
  <li>Per-pillar score breakdown and flags</li>
  <li>The enforcement verdict and the policy version applied</li>
  <li>An AI-written risk thesis and recommendations</li>
  <li>A content checksum for integrity verification</li>
</ul>

<h2 id="generate">Generating a report</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Open an audit record (or a date range) in the dashboard.</p></div>
  <div class="step"><span class="snum">2</span><p>Click <strong>Generate report</strong> — the PDF is produced on demand and saved to your Reports library.</p></div>
  <div class="step"><span class="snum">3</span><p>Download or share it with auditors, customers, or your security team.</p></div>
</div>

<h2 id="thesis">AI Risk Thesis</h2>
<p>Each report includes a forensic narrative: what the evaluated request was doing, which pillars were most affected and why, whether the enforcement action was proportionate, and whether the event looks isolated or part of a drift pattern — followed by prioritized, actionable recommendations.</p>

<h2 id="integrity">Integrity</h2>
<div class="cl cl-info">Reports embed a checksum and reference the immutable audit records they summarize, so a recipient can confirm the report was not altered after generation.</div>`,
  },

  "audit-retention": {
    id: "audit-retention",
    title: "Log Retention",
    leadText: "How long audit data is kept, and how retention maps to your plan and compliance needs.",
    toc: [
      { id: "by-plan", label: "Retention by plan" },
      { id: "deletion", label: "Deletion & the chain" },
      { id: "export", label: "Long-term archival" },
    ],
    htmlContent: `
<h2 id="by-plan">Retention by plan</h2>
<table>
  <thead><tr><th>Plan</th><th>Audit retention</th></tr></thead>
  <tbody>
    <tr><td>Free</td><td>30 days</td></tr>
    <tr><td>Grow</td><td>90 days</td></tr>
    <tr><td>Scale</td><td>1 year</td></tr>
    <tr><td>Enterprise</td><td>Custom (multi-year / unlimited)</td></tr>
  </tbody>
</table>

<h2 id="deletion">Deletion &amp; the chain</h2>
<p>Because the audit trail is append-only and hash-chained, individual records are never edited or hard-deleted in place. When data ages out of retention, an entire tenant chain segment is expired as a unit so integrity guarantees are preserved for whatever remains.</p>
<div class="cl cl-warn">GDPR-style erasure of personal data is handled at the source — VeldrixAI does not store raw PII in the log, so the audit trail itself contains no erasable personal data.</div>

<h2 id="export">Long-term archival</h2>
<p>For regulatory retention beyond your plan window, export audit data to CSV/JSON on a schedule and archive it in your own object store or GRC platform. Enterprise plans can configure automated export to S3/GCS.</p>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PROMPT ARCHITECT
  // ─────────────────────────────────────────────────────────────────────────
  "prompt-overview": {
    id: "prompt-overview",
    title: "Prompt Architect",
    leadText: "Generate hardened, policy-aligned prompt templates that reduce risk before a single token is generated.",
    toc: [
      { id: "what", label: "What it does" },
      { id: "why", label: "Why harden prompts" },
      { id: "workflow", label: "Workflow" },
    ],
    htmlContent: `
<h2 id="what">What it does</h2>
<p>Prompt Architect turns a plain description of your task into a production-grade system prompt with built-in guardrails: explicit role, scope boundaries, refusal rules, output format, and injection-resistant instructions.</p>

<h2 id="why">Why harden prompts</h2>
<p>The cheapest place to prevent unsafe output is the prompt itself. A well-architected system prompt reduces the rate of <code>BLOCK</code>/<code>REVIEW</code> verdicts downstream — fewer incidents, lower review load, and lower latency from retries.</p>
<div class="cl cl-tip">Prompt Architect and the Trust Engine are complementary: architect the prompt to prevent issues, then evaluate the output to catch what slips through.</div>

<h2 id="workflow">Workflow</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Describe the assistant's job and constraints.</p></div>
  <div class="step"><span class="snum">2</span><p>Choose a <a href="/docs/prompt-modes">mode</a>: Strict, Balanced, or Adaptive.</p></div>
  <div class="step"><span class="snum">3</span><p><a href="/docs/prompt-generate">Generate</a> the template and copy it into your application.</p></div>
</div>`,
  },

  "prompt-generate": {
    id: "prompt-generate",
    title: "Generate Templates",
    leadText: "Produce a hardened prompt template from a short task description.",
    toc: [
      { id: "dashboard", label: "In the dashboard" },
      { id: "anatomy", label: "Anatomy of a generated template" },
      { id: "iterate", label: "Iterate" },
    ],
    htmlContent: `
<h2 id="dashboard">In the dashboard</h2>
<div class="steps">
  <div class="step"><span class="snum">1</span><p>Open <strong>Prompt Architect → Generate</strong>.</p></div>
  <div class="step"><span class="snum">2</span><p>Enter the task, audience, and any hard rules (e.g. "never give medical dosages").</p></div>
  <div class="step"><span class="snum">3</span><p>Pick a <a href="/docs/prompt-modes">mode</a> and generate.</p></div>
</div>

<h2 id="anatomy">Anatomy of a generated template</h2>
<ul>
  <li><strong>Role &amp; scope</strong> — who the assistant is and what it must not do.</li>
  <li><strong>Guardrails</strong> — refusal and escalation rules aligned to your pillars.</li>
  <li><strong>Injection resistance</strong> — instructions that resist override attempts.</li>
  <li><strong>Output contract</strong> — format, tone, and length constraints.</li>
</ul>

<h2 id="iterate">Iterate</h2>
<p>Generate, deploy with a <code>vx-test-</code> key, evaluate real outputs against your policy, and regenerate with tighter rules where you see <code>REVIEW</code>/<code>BLOCK</code> verdicts clustering.</p>`,
  },

  "prompt-modes": {
    id: "prompt-modes",
    title: "Strict / Balanced / Adaptive",
    leadText: "Three generation modes that trade off caution against flexibility.",
    toc: [
      { id: "modes", label: "The three modes" },
      { id: "choosing", label: "Choosing a mode" },
    ],
    htmlContent: `
<h2 id="modes">The three modes</h2>
<div class="cards">
  <div class="card"><h4>Strict</h4><p>Maximum caution. Broad refusals, tight scope, conservative output. Best for regulated or high-stakes domains.</p></div>
  <div class="card"><h4>Balanced</h4><p>The default. Sensible guardrails with room for helpful, natural responses. Best for most products.</p></div>
  <div class="card"><h4>Adaptive</h4><p>Context-aware guardrails that scale with detected risk — lighter on benign requests, stricter on sensitive ones.</p></div>
</div>

<h2 id="choosing">Choosing a mode</h2>
<table>
  <thead><tr><th>If your priority is…</th><th>Use</th></tr></thead>
  <tbody>
    <tr><td>Minimizing any unsafe output, accepting more refusals</td><td>Strict</td></tr>
    <tr><td>A good default for a general audience</td><td>Balanced</td></tr>
    <tr><td>Helpfulness with risk-proportionate guardrails</td><td>Adaptive</td></tr>
  </tbody>
</table>
<div class="cl cl-info">Mode shapes the generated prompt only. Your <a href="/docs/policy-overview">policy</a> still governs enforcement on the output, so the two layers reinforce each other.</div>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNTS & BILLING
  // ─────────────────────────────────────────────────────────────────────────
  "billing-accounts": {
    id: "billing-accounts",
    title: "Manage accounts",
    leadText: "Billing ownership, the customer portal, and organization-level settings.",
    toc: [
      { id: "ownership", label: "Billing ownership" },
      { id: "portal", label: "Customer portal" },
      { id: "invoices", label: "Invoices & receipts" },
    ],
    htmlContent: `
<h2 id="ownership">Billing ownership</h2>
<p>Billing is managed at the organization level by the <strong>Owner</strong> role. Subscription, payment method, and plan changes all live under <strong>Settings → Billing</strong>.</p>

<h2 id="portal">Customer portal</h2>
<p>VeldrixAI uses Stripe for payments. The billing page links to the Stripe customer portal, where you can update cards, change plans, and download invoices securely — VeldrixAI never stores raw card data.</p>

<h2 id="invoices">Invoices &amp; receipts</h2>
<p>Every payment generates a downloadable PDF receipt. Enterprise customers can arrange annual invoicing and purchase orders via <a href="mailto:sales@veldrixai.ca">sales@veldrixai.ca</a>. See <a href="/docs/ref-billing">Billing information</a> for payment methods, cancellation, and refunds.</p>`,
  },

  "billing-overview": {
    id: "billing-overview",
    title: "Billing overview",
    leadText: "How VeldrixAI billing works: plans, quotas, trials, and metering.",
    toc: [
      { id: "model", label: "Billing model" },
      { id: "trial", label: "Free trial" },
      { id: "quota", label: "Quotas & overage" },
    ],
    htmlContent: `
<h2 id="model">Billing model</h2>
<p>VeldrixAI is billed as a monthly subscription. Each <a href="/docs/billing-plans">plan</a> includes a monthly quota of evaluations (audit requests). <code>vx-test-</code> traffic does not count toward your quota.</p>

<h2 id="trial">Free trial</h2>
<div class="cl cl-info">All new accounts start on a 14-day free trial of a paid plan — no credit card required. After the trial you can stay on the Free plan or upgrade.</div>

<h2 id="quota">Quotas &amp; overage</h2>
<p>Your dashboard shows real-time usage against your monthly quota. When you approach the limit you'll be notified so you can upgrade before evaluations are throttled. See <a href="/docs/billing-usage">Usage metering</a> for details.</p>`,
  },

  "billing-plans": {
    id: "billing-plans",
    title: "Plans & Pricing",
    leadText: "Four plans from Free to Enterprise — pick the quota and support level your team needs.",
    toc: [
      { id: "plans", label: "The plans" },
      { id: "compare", label: "Feature comparison" },
      { id: "upgrade", label: "Upgrading" },
    ],
    htmlContent: `
<h2 id="plans">The plans</h2>
<table>
  <thead><tr><th>Plan</th><th>Price</th><th>Evaluations / month</th></tr></thead>
  <tbody>
    <tr><td><strong>Free</strong></td><td>$0</td><td>1,000</td></tr>
    <tr><td><strong>Grow</strong></td><td>$49/mo</td><td>25,000</td></tr>
    <tr><td><strong>Scale</strong></td><td>$199/mo</td><td>150,000</td></tr>
    <tr><td><strong>Enterprise</strong></td><td>Custom</td><td>Unlimited</td></tr>
  </tbody>
</table>

<h2 id="compare">Feature comparison</h2>
<table>
  <thead><tr><th>Capability</th><th>Free</th><th>Grow</th><th>Scale</th><th>Enterprise</th></tr></thead>
  <tbody>
    <tr><td>All 5 evaluation pillars</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
    <tr><td>REST API &amp; SDKs</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
    <tr><td>Audit trail &amp; logs</td><td>—</td><td>✓</td><td>✓</td><td>✓</td></tr>
    <tr><td>Webhook integrations</td><td>—</td><td>✓</td><td>✓</td><td>✓</td></tr>
    <tr><td>Custom pillar weights</td><td>—</td><td>—</td><td>✓</td><td>✓</td></tr>
    <tr><td>SSO / SAML</td><td>—</td><td>—</td><td>✓</td><td>✓</td></tr>
    <tr><td>Priority support (4h SLA)</td><td>—</td><td>—</td><td>✓</td><td>✓</td></tr>
    <tr><td>On-prem / VPC deploy</td><td>—</td><td>—</td><td>—</td><td>✓</td></tr>
    <tr><td>99.99% uptime SLA</td><td>—</td><td>—</td><td>—</td><td>✓</td></tr>
  </tbody>
</table>

<h2 id="upgrade">Upgrading</h2>
<p>Upgrade or downgrade anytime from <strong>Settings → Billing</strong>. Changes are prorated. Talk to <a href="mailto:sales@veldrixai.ca">sales@veldrixai.ca</a> for Enterprise, volume pricing, or on-prem deployment.</p>`,
  },

  "billing-usage": {
    id: "billing-usage",
    title: "Usage metering",
    leadText: "How evaluations are counted, monitored, and limited.",
    toc: [
      { id: "what-counts", label: "What counts as usage" },
      { id: "monitoring", label: "Monitoring usage" },
      { id: "limits", label: "When you hit the limit" },
    ],
    htmlContent: `
<h2 id="what-counts">What counts as usage</h2>
<ul>
  <li>One evaluation = one audit request, regardless of how many pillars run.</li>
  <li><code>vx-live-</code> traffic counts; <code>vx-test-</code> traffic does not.</li>
  <li>Background and inline evaluations are metered identically.</li>
  <li>Generating a PDF report or AI Risk Thesis does not consume an evaluation.</li>
</ul>

<h2 id="monitoring">Monitoring usage</h2>
<p>The dashboard shows current-period usage, your quota, and a daily trend. Set up usage alerts under <strong>Settings → Billing</strong> to be notified at 80% and 100% of quota.</p>

<h2 id="limits">When you hit the limit</h2>
<div class="cl cl-warn">On the Free plan, evaluations beyond the monthly quota are rejected until the period resets or you upgrade. Paid plans can enable overage so production traffic is never interrupted — usage above quota is billed at your plan's per-evaluation rate.</div>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INTEGRATIONS
  // ─────────────────────────────────────────────────────────────────────────
  "integrations-overview": {
    id: "integrations-overview",
    title: "Integrations Overview",
    leadText: "Three ways to integrate VeldrixAI — pick the one that fits your stack.",
    toc: [
      { id: "options", label: "Integration options" },
      { id: "choosing", label: "Choosing an approach" },
      { id: "auth", label: "Authentication" },
    ],
    htmlContent: `
<h2 id="options">Integration options</h2>
<div class="cards">
  <div class="card"><h4><a href="/docs/integrations-python">Python SDK</a></h4><p>Full-featured: guard decorator, middleware, interceptors, background evaluation.</p></div>
  <div class="card"><h4><a href="/docs/integrations-ts">TypeScript / Node</a></h4><p>Call the REST API from any JS runtime with a thin typed client.</p></div>
  <div class="card"><h4><a href="/docs/integrations-rest">REST API</a></h4><p>Language-agnostic HTTP — works anywhere.</p></div>
</div>

<h2 id="choosing">Choosing an approach</h2>
<table>
  <thead><tr><th>If you…</th><th>Use</th></tr></thead>
  <tbody>
    <tr><td>Run Python services and want zero-latency background guards</td><td>Python SDK</td></tr>
    <tr><td>Work in Node/Next.js/Deno</td><td>TypeScript + REST</td></tr>
    <tr><td>Use Go, Ruby, Java, or anything else</td><td>REST API</td></tr>
  </tbody>
</table>

<h2 id="auth">Authentication</h2>
<p>Every integration authenticates with an API key (<code>vx-live-</code> / <code>vx-test-</code>) sent as a bearer token. The base URL is <code>https://api.veldrixai.ca</code>. See <a href="/docs/api-keys">Manage API keys</a>.</p>`,
  },

  "integrations-python": {
    id: "integrations-python",
    title: "Python SDK",
    leadText: "The reference implementation: client, guard decorator, framework middleware, and provider interceptors.",
    toc: [
      { id: "install", label: "Install" },
      { id: "client", label: "Client" },
      { id: "evaluate", label: "Evaluate" },
      { id: "guard", label: "Guard decorator" },
      { id: "middleware", label: "Web middleware" },
      { id: "errors", label: "Error handling" },
    ],
    htmlContent: `
<h2 id="install">Install</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>pip install veldrixai</code></pre>
</div>

<h2 id="client">Client</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>import veldrixai

# Explicit key
client = veldrixai.Veldrix(api_key="vx-live-...")

# Or from the environment (VELDRIX_API_KEY)
client = veldrixai.Veldrix.from_env()

# Options
client = veldrixai.Veldrix(
    api_key="vx-live-...",
    base_url="https://api.veldrixai.ca",   # default
    background=True,                          # async by default
)</code></pre>
</div>

<h2 id="evaluate">Evaluate</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code># Synchronous
result = client.evaluate_sync(prompt=p, response=r, metadata={"context": docs})

# Async
result = await client.evaluate(prompt=p, response=r)

result.overall          # 0.0–1.0
result.verdict          # ALLOW | WARN | REVIEW | BLOCK
result.pillar_scores    # {"safety": 0.97, ...}
result.critical_flags   # ["pii_detected", ...]</code></pre>
</div>

<h2 id="guard">Guard decorator</h2>
<p>Wrap any function returning model text. Background by default; opt into blocking per verdict.</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>from veldrixai import Veldrix, GuardConfig
veldrix = Veldrix(api_key="vx-live-...")

@veldrix.guard(config=GuardConfig(
    background=False,            # block until evaluated
    block_on_verdict=["BLOCK"], # raise VeldrixBlocked on these verdicts
    timeout_ms=10_000,
))
def answer(prompt: str) -> str:
    return llm.complete(prompt)</code></pre>
</div>

<h2 id="middleware">Web middleware</h2>
<p>Drop-in middleware for FastAPI and Flask evaluates responses centrally:</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>from veldrixai import VeldrixMiddleware, init_flask

# FastAPI
app.add_middleware(VeldrixMiddleware, api_key="vx-live-...")

# Flask
init_flask(app, api_key="vx-live-...")</code></pre>
</div>

<h2 id="errors">Error handling</h2>
<table>
  <thead><tr><th>Exception</th><th>Raised when</th></tr></thead>
  <tbody>
    <tr><td><code>VeldrixBlocked</code></td><td>A guarded call returns a verdict in <code>block_on_verdict</code>.</td></tr>
    <tr><td><code>VeldrixAuthError</code></td><td>The API key is missing, malformed, or revoked.</td></tr>
    <tr><td><code>VeldrixTimeout</code></td><td>Evaluation exceeded <code>timeout_ms</code>.</td></tr>
  </tbody>
</table>
<div class="cl cl-tip">In background mode the SDK never blocks your LLM path — if VeldrixAI is unreachable, your app keeps serving and the evaluation is retried/logged out of band (fail-open by design).</div>`,
  },

  "integrations-ts": {
    id: "integrations-ts",
    title: "TypeScript SDK",
    leadText: "Call the Trust Engine from any JavaScript runtime — Node, Next.js, Deno, or the edge.",
    toc: [
      { id: "rest-first", label: "REST-first" },
      { id: "client", label: "A thin typed client" },
      { id: "types", label: "Result types" },
    ],
    htmlContent: `
<h2 id="rest-first">REST-first</h2>
<p>From TypeScript, call the <a href="/docs/integrations-rest">REST API</a> directly — no native dependency required. Always call it from server-side code (route handlers, server actions) so your <code>vx-live-</code> key never reaches the browser.</p>

<h2 id="client">A thin typed client</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="typescript">TypeScript</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="typescript"><code>type Verdict = "ALLOW" | "WARN" | "REVIEW" | "BLOCK";

interface EvalResponse {
  data: {
    request_id: string;
    final_score: { value: number; confidence: number; risk_level: string };
    pillar_results: Record&lt;string, { score: { value: number }; flags: string[] }&gt;;
    execution_time_ms: number;
  };
}

export async function evaluate(prompt: string, response: string, model = "gpt-4o") {
  const res = await fetch("https://api.veldrixai.ca/trust/evaluate", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.VELDRIX_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, response, model }),
  });
  if (!res.ok) throw new Error("VeldrixAI " + res.status);
  return (await res.json()) as EvalResponse;
}</code></pre>
</div>

<h2 id="types">Result types</h2>
<p>Over REST, <code>final_score.value</code> is on a 0–100 scale and <code>risk_level</code> mirrors the verdict band. Normalize to 0–1 (<code>value / 100</code>) if you want parity with the Python SDK's <code>overall</code>.</p>
<div class="cl cl-info">A first-class TypeScript SDK with the guard/middleware ergonomics of the Python package is on the roadmap. Until then this pattern is fully supported and production-ready.</div>`,
  },

  "integrations-rest": {
    id: "integrations-rest",
    title: "REST API",
    leadText: "The language-agnostic HTTP interface to the Trust Engine.",
    toc: [
      { id: "base", label: "Base URL & auth" },
      { id: "evaluate", label: "POST /trust/evaluate" },
      { id: "response", label: "Response shape" },
      { id: "audit", label: "Audit & reports endpoints" },
      { id: "errors", label: "Errors & rate limits" },
    ],
    htmlContent: `
<h2 id="base">Base URL &amp; auth</h2>
<p>Base URL: <code>https://api.veldrixai.ca</code>. Authenticate with a bearer token:</p>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="bash">HTTP</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="bash"><code>Authorization: Bearer vx-live-...
Content-Type: application/json
x-veldrix-sla-tier: STANDARD     # optional: REALTIME | STANDARD | BACKGROUND</code></pre>
</div>

<h2 id="evaluate">POST /trust/evaluate</h2>
<table>
  <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
  <tbody>
    <tr><td><code>prompt</code></td><td>string</td><td>Yes</td><td>The input/prompt that produced the response.</td></tr>
    <tr><td><code>response</code></td><td>string</td><td>Yes</td><td>The model output to evaluate.</td></tr>
    <tr><td><code>model</code></td><td>string</td><td>No</td><td>Model identifier, for reporting (e.g. <code>gpt-4o</code>).</td></tr>
    <tr><td><code>context</code></td><td>string</td><td>No</td><td>Ground-truth/source for hallucination checks.</td></tr>
    <tr><td><code>metadata</code></td><td>object</td><td>No</td><td>Arbitrary tags stored with the audit record.</td></tr>
  </tbody>
</table>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="bash">cURL</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="bash"><code>curl https://api.veldrixai.ca/trust/evaluate \\
  -H "Authorization: Bearer vx-live-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Summarize the patient record.",
    "response": "John Smith, DOB 1985-03-12, has hypertension.",
    "model": "gpt-4o"
  }'</code></pre>
</div>

<h2 id="response">Response shape</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="json">JSON</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="json"><code>{
  "success": true,
  "data": {
    "request_id": "req_a1b2c3d4",
    "final_score": { "value": 34.0, "confidence": 0.92, "risk_level": "high_risk" },
    "pillar_results": {
      "compliance": { "score": { "value": 12.0 }, "flags": ["pii_detected"] },
      "safety":     { "score": { "value": 95.0 }, "flags": [] }
    },
    "execution_time_ms": 312
  }
}</code></pre>
</div>
<div class="cl cl-info">REST scores are 0–100 (<code>final_score.value</code>); the Python SDK normalizes to 0–1 (<code>overall</code>). <code>risk_level</code> corresponds to the verdict band.</div>

<h2 id="audit">Audit &amp; reports endpoints</h2>
<table>
  <thead><tr><th>Endpoint</th><th>Purpose</th></tr></thead>
  <tbody>
    <tr><td><code>GET /api/audit-trails</code></td><td>List/filter audit records.</td></tr>
    <tr><td><code>GET /api/audit-trails/{request_id}/detail</code></td><td>Full record for one evaluation.</td></tr>
    <tr><td><code>POST /api/audit-trails/{request_id}/intelligence</code></td><td>Generate the AI Risk Thesis.</td></tr>
    <tr><td><code>POST /api/reports/generate-pdf</code></td><td>Produce a PDF compliance report.</td></tr>
  </tbody>
</table>

<h2 id="errors">Errors &amp; rate limits</h2>
<table>
  <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>401</code></td><td>Missing/invalid API key.</td></tr>
    <tr><td><code>422</code></td><td>Malformed request body.</td></tr>
    <tr><td><code>429</code></td><td>Quota exceeded or rate limited — back off and retry.</td></tr>
    <tr><td><code>5xx</code></td><td>Transient server error — retry with exponential backoff.</td></tr>
  </tbody>
</table>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REFERENCE
  // ─────────────────────────────────────────────────────────────────────────
  "ref-enforcement": {
    id: "ref-enforcement",
    title: "Enforcement Actions",
    leadText: "The complete reference for verdicts and how to act on each one.",
    toc: [
      { id: "verdicts", label: "Verdicts" },
      { id: "acting", label: "Acting on a verdict" },
      { id: "hard-block", label: "Hard-block flags" },
      { id: "patterns", label: "Recommended patterns" },
    ],
    htmlContent: `
<h2 id="verdicts">Verdicts</h2>
<table>
  <thead><tr><th>Verdict</th><th>Default band</th><th>Intent</th></tr></thead>
  <tbody>
    <tr><td><code>ALLOW</code></td><td>≥ 0.85</td><td>Trusted — deliver as-is.</td></tr>
    <tr><td><code>WARN</code></td><td>0.60–0.85</td><td>Deliver, but log/annotate for review.</td></tr>
    <tr><td><code>REVIEW</code></td><td>0.40–0.60</td><td>Hold for human review or use a fallback.</td></tr>
    <tr><td><code>BLOCK</code></td><td>&lt; 0.40</td><td>Do not deliver.</td></tr>
  </tbody>
</table>
<p>Two additional states can appear in the SDK: <code>PENDING</code> (background evaluation not yet complete) and <code>UNKNOWN</code> (evaluation could not be completed — treat per your fail-open/closed choice).</p>

<h2 id="acting">Acting on a verdict</h2>
<div class="cblk">
  <div class="cbh"><span class="cbt active" data-lang="python">Python</span><button class="cbcopy" aria-label="Copy code">Copy</button></div>
  <pre data-lang="python"><code>r = client.evaluate_sync(prompt=p, response=draft)
if r.verdict == "BLOCK":
    final = SAFE_FALLBACK
elif r.verdict == "REVIEW":
    final = enqueue_for_human_review(draft)
else:  # ALLOW or WARN
    final = draft
    if r.verdict == "WARN":
        log_warning(r.request_id, r.all_flags)</code></pre>
</div>

<h2 id="hard-block">Hard-block flags</h2>
<p>These flags force <code>BLOCK</code> regardless of the aggregate score:</p>
<ul>
  <li><code>prompt_injection_detected</code></li>
  <li><code>explicit_content_detected</code></li>
  <li><code>content_unsafe</code> (critical)</li>
  <li><code>policy_violation_critical</code>, <code>policy_violation_high</code></li>
</ul>

<h2 id="patterns">Recommended patterns</h2>
<div class="cl cl-tip">For user-facing chat, evaluate inline only on the final answer and block on <code>BLOCK</code>; for everything else, evaluate in the background so latency is untouched and you still get the full audit trail.</div>`,
  },

  "ref-security": {
    id: "ref-security",
    title: "Security & Compliance",
    leadText: "How VeldrixAI protects your data and supports your compliance program.",
    toc: [
      { id: "data", label: "Data handling" },
      { id: "audit-integrity", label: "Audit integrity" },
      { id: "isolation", label: "Tenant isolation" },
      { id: "frameworks", label: "Frameworks" },
      { id: "deployment", label: "Deployment options" },
    ],
    htmlContent: `
<h2 id="data">Data handling</h2>
<ul>
  <li><strong>No raw PII in logs.</strong> The audit trail stores detection metadata, not the sensitive content itself.</li>
  <li><strong>Encryption.</strong> Data is encrypted in transit (TLS 1.2+) and at rest (AES-256).</li>
  <li><strong>Minimal retention.</strong> You can run with <code>include_prompt=false</code> so prompts are never transmitted.</li>
</ul>

<h2 id="audit-integrity">Audit integrity</h2>
<p>The <a href="/docs/audit-trails">audit trail</a> is append-only and hash-chained per tenant, with a database-level trigger that rejects updates and deletes. Integrity is independently verifiable, which is what makes VeldrixAI logs admissible as compliance evidence.</p>

<h2 id="isolation">Tenant isolation</h2>
<p>Every organization's data — keys, policies, audit chains — is isolated. Audit chains are keyed per tenant so one customer's records can never be read or interleaved with another's.</p>

<h2 id="frameworks">Frameworks</h2>
<div class="cards">
  <div class="card"><h4>SOC 2 Type II</h4><p>Controls aligned to the Trust Services Criteria.</p></div>
  <div class="card"><h4>GDPR / CCPA</h4><p>Data-minimization and subject-rights support.</p></div>
  <div class="card"><h4>HIPAA</h4><p>PHI detection plus BAA availability on Enterprise.</p></div>
  <div class="card"><h4>EU AI Act</h4><p>Evidence for risk management and human-oversight obligations.</p></div>
</div>
<div class="cl cl-info">Request the latest compliance reports and a BAA from <a href="mailto:security@veldrixai.ca">security@veldrixai.ca</a>.</div>

<h2 id="deployment">Deployment options</h2>
<p>VeldrixAI runs as a managed cloud service by default. Enterprise customers can deploy in their own VPC or fully on-prem so that no evaluated content ever leaves their network.</p>`,
  },

  "ref-billing": {
    id: "ref-billing",
    title: "Billing information",
    leadText: "Payment methods, invoicing, cancellation, and refunds.",
    toc: [
      { id: "payment-methods", label: "Payment methods" },
      { id: "invoicing", label: "Invoicing" },
      { id: "cancellation", label: "Cancellation policy" },
      { id: "refunds", label: "Refunds" },
    ],
    htmlContent: `
<h2 id="payment-methods">Payment methods</h2>
<p>VeldrixAI accepts all major credit and debit cards (Visa, Mastercard, Amex, Discover) via Stripe. Card data is handled entirely by Stripe — VeldrixAI never sees or stores raw card numbers.</p>

<h2 id="invoicing">Invoicing</h2>
<p>Monthly plans are charged automatically and produce a downloadable receipt. Enterprise customers can arrange annual invoicing and purchase orders via <a href="mailto:sales@veldrixai.ca">sales@veldrixai.ca</a>.</p>

<h2 id="cancellation">Cancellation policy</h2>
<p>Cancel anytime from the billing portal. Access continues until the end of the current billing period. Audit logs remain accessible for 30 days after cancellation, then are permanently purged.</p>

<h2 id="refunds">Refunds</h2>
<p>Monthly subscriptions are non-refundable. Annual subscriptions may be eligible for a prorated refund within 30 days of payment — contact <a href="mailto:support@veldrixai.ca">support@veldrixai.ca</a>.</p>`,
  },
};

export function getDocPage(slug: string): DocPageContent | null {
  return DOC_PAGES[slug] ?? null;
}

export function getAllDocSlugs(): string[] {
  return Object.keys(DOC_PAGES);
}
