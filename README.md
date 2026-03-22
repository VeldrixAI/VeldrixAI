<div align="center">

<img src="logos/veldrix-mark.svg" width="72" height="72" alt="VeldrixAI logo mark">

# VeldrixAI

**Runtime Trust Infrastructure for AI Applications & Autonomous Agents**

  <p>
    <a href="https://pypi.org/project/veldrixai/"><img src="https://img.shields.io/pypi/v/veldrixai?color=7C3AED&label=veldrixai" alt="PyPI"></a>
    <a href="https://pypi.org/project/veldrixai/"><img src="https://img.shields.io/pypi/pyversions/veldrixai?color=7C3AED" alt="Python"></a>
    <img src="https://img.shields.io/badge/license-MIT-7C3AED" alt="License">
    <img src="https://img.shields.io/badge/NVIDIA_NIM-powered-76B900?logo=nvidia" alt="NVIDIA NIM">
    <img src="https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi" alt="FastAPI">
    <img src="https://img.shields.io/badge/Next.js-frontend-black?logo=nextdotjs" alt="Next.js">
  </p>

</div>

---

## What is VeldrixAI?

VeldrixAI is an **AI runtime trust layer** that sits between your application and any LLM provider. It evaluates every prompt/response pair across five safety pillars powered by NVIDIA NIM inference:

| Pillar | Weight | Purpose |
|--------|--------|---------|
| **Safety & Toxicity** | 25% | Detect harmful content, violence, hate speech |
| **Hallucination** | 25% | Verify factual accuracy and groundedness |
| **Bias & Fairness** | 20% | Identify demographic bias and unfair treatment |
| **Prompt Security** | 15% | Catch injection attacks and jailbreak attempts |
| **Compliance & PII** | 15% | Enforce policy and detect sensitive data |

A **composite trust score** (0–100) is returned with every evaluation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Application                        │
│                                                             │
│  import openai / anthropic / langchain / litellm / ...      │
└────────────────────────┬────────────────────────────────────┘
                         │  (intercepted automatically)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              VeldrixAI SDK  (pip install veldrixai)          │
│                                                             │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│   │  @guard     │  │  ASGI        │  │  Global HTTP     │  │
│   │  decorator  │  │  Middleware  │  │  Interceptor     │  │
│   └─────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│   Adapters: OpenAI · Anthropic · Gemini · Bedrock · Cohere  │
│             Mistral · Groq · Ollama · LangChain · LlamaIndex │
│             LiteLLM · DeepSeek · Qwen · HuggingFace · +more  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              VeldrixAI Backend (self-host or cloud)          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Auth        │  │  Trust       │  │  Connectors      │  │
│  │  Service     │  │  Engine      │  │  (Reports/Audit) │  │
│  │  :8000       │  │  :8001       │  │  :8002           │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          NVIDIA NIM Inference API                     │   │
│  │  llama-guard-4-12b · llama-3.1-8b-instruct           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security — AES-256 Vault Encryption

VeldrixAI implements **AES-256-GCM authenticated encryption** for all sensitive data stored at rest. No credential, API key, OAuth token, or connector secret ever touches the database in plaintext.

### How it works

| Layer | Mechanism |
|---|---|
| Algorithm | AES-256-GCM (NIST-recommended, authenticated) |
| Key size | 256-bit (32 bytes), environment-injected |
| Nonce | 96-bit cryptographically random, unique per encryption |
| Auth tag | 128-bit GCM authentication tag (tamper detection) |
| Storage format | `base64(nonce ‖ ciphertext ‖ tag)` in PostgreSQL TEXT column |
| Key delivery | `VELDRIX_VAULT_KEY` environment variable — never committed to source |

### What is encrypted

All sensitive fields in `aegisai-auth` are encrypted at the persistence boundary:

- **Stripe customer IDs** linking users to billing accounts
- **Stripe subscription IDs** for plan management

Passwords are hashed separately using `bcrypt` (irreversible) and are not subject to vault encryption. API keys are also bcrypt-hashed (one-way) and never stored in recoverable form.

### Encryption boundary

```
Application layer          Persistence layer
─────────────────          ──────────────────
plaintext secret  →  encrypt()  →  AES-256-GCM ciphertext  →  PostgreSQL
plaintext secret  ←  decrypt()  ←  AES-256-GCM ciphertext  ←  PostgreSQL
```

The vault module (`backend/auth/app/vault.py`) is the sole encryption boundary. No other code performs encryption or decryption.

### Key management

Generate a vault key:
```bash
python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

Set it in your environment:
```env
VELDRIX_VAULT_KEY=<your-base64-encoded-32-byte-key>
```

In production, inject `VELDRIX_VAULT_KEY` via your secrets manager (AWS Secrets Manager, DigitalOcean App Platform environment variables, HashiCorp Vault, etc.). **Never commit a real key to source control.**

### Compliance relevance

AES-256-GCM satisfies at-rest encryption requirements for:
- **SOC 2 Type II** — CC6.1 (logical access), CC6.7 (data at rest)
- **GDPR Article 32** — appropriate technical measures for personal data
- **HIPAA § 164.312(a)(2)(iv)** — encryption and decryption of ePHI
- **PCI-DSS Requirement 3.5** — protection of stored cardholder data

This makes VeldrixAI suitable for B2B enterprise deployments in regulated industries — health, finance, and legal.

---

## Quickstart

### Install the SDK

```bash
pip install veldrixai
```

### Option 1 — Global HTTP Intercept (zero code changes)

```python
import veldrixai
from veldrixai.http_interceptor import enable_global_intercept

client = veldrixai.Veldrix(api_key="vx-live-...")
enable_global_intercept(client)

# Use ANY AI SDK as normal — all calls are monitored automatically
import openai
response = openai.OpenAI().chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Option 2 — Direct evaluation

```python
from veldrixai import Veldrix

client = Veldrix(api_key="vx-live-...")
result = await client.evaluate(
    prompt="Explain quantum computing",
    response="Quantum computers use qubits...",
)

print(f"Trust Score: {result.overall:.0%}")
print(f"Verdict:     {result.verdict}")
```

### Option 3 — FastAPI Middleware

```python
from fastapi import FastAPI
from veldrixai.middleware import VeldrixMiddleware

app = FastAPI()
app.add_middleware(VeldrixMiddleware, api_key="vx-live-...")
```

### Option 4 — Decorator

```python
from veldrixai import Veldrix

veldrix = Veldrix(api_key="vx-live-...")

@veldrix.guard
def chat(messages):
    return openai_client.chat.completions.create(
        model="gpt-4o", messages=messages
    )

response = chat(messages)
print(response.trust.verdict)   # ALLOW | WARN | REVIEW | BLOCK
print(response.trust.overall)   # 0.0 – 1.0
```

---

## Supported Providers

### US / Global
| Provider | Adapter |
|----------|---------|
| OpenAI (GPT-4o, o1, ...) | `openai` |
| Anthropic (Claude) | `anthropic` |
| Google Gemini + Vertex AI | `google` |
| AWS Bedrock (all models) | `aws_bedrock` |
| Azure OpenAI | `azure_openai` |
| Cohere | `cohere` |
| Mistral AI | `mistral` |
| Groq | `openai` (compatible) |
| Together AI | `openai` (compatible) |
| Fireworks AI | `openai` (compatible) |
| Perplexity | `openai` (compatible) |
| Replicate | `generic` |
| Hugging Face | `huggingface` |
| NVIDIA NIM | `openai` (compatible) |
| OpenRouter | `openai` (compatible) |
| LiteLLM Proxy | `litellm` |

### Self-hosted / Local
| Provider | Adapter |
|----------|---------|
| Ollama | `ollama` |
| vLLM | `openai` (compatible) |
| LocalAI | `openai` (compatible) |

### Asia-Pacific / China
| Provider | Adapter |
|----------|---------|
| DeepSeek | `deepseek` |
| Alibaba Qwen | `qwen` |
| Baidu ERNIE | `generic` |
| Zhipu AI (ChatGLM) | `openai` (compatible) |
| Moonshot AI (Kimi) | `openai` (compatible) |
| MiniMax | `generic` |
| 01.AI (Yi) | `openai` (compatible) |
| Tencent Hunyuan | `generic` |

### Framework Support
| Framework | Integration |
|-----------|-------------|
| LangChain | `langchain` adapter |
| LlamaIndex | `llamaindex` adapter |
| FastAPI / Starlette | ASGI middleware |
| Django | WSGI middleware |
| Flask | `init_flask()` hook |

---

## Self-Hosting

### Prerequisites

- Docker & Docker Compose
- NVIDIA API key ([get one free](https://developer.nvidia.com/))
- PostgreSQL 16 (provided via Docker)

### Start the full stack

```bash
git clone https://github.com/VeldrixAI/veldrixai.git
cd veldrixai
cp aegisai-auth/.env.example aegisai-auth/.env
cp aegisai-ui/.env.local.example aegisai-ui/.env.local
# Edit both files — add your NVIDIA_API_KEY and other credentials
docker compose up -d
```

Services will be available at:
- **Dashboard**: http://localhost:5000
- **Auth API**: http://localhost:8000/docs
- **Trust Engine**: http://localhost:8001/docs
- **Connectors**: http://localhost:8002/docs

### Project Structure

```
veldrixai/
├── aegisai-auth/        → Authentication, API keys, billing (FastAPI, port 8000)
├── aegisai-core/        → Trust evaluation engine (FastAPI, port 8001)
├── aegisai-connectors/  → Reports, audit logs, analytics (FastAPI, port 8002)
├── aegisai-ui/          → Dashboard + landing page (Next.js, port 5000)
├── aegisai-sdk/         → Python SDK (pip install veldrixai)
├── docker-compose.yml   → Full-stack orchestration
└── README.md            → This file
```

---

## Trust Score

Every evaluation returns a composite trust score and per-pillar breakdown:

```json
{
  "trust_score": 87.4,
  "pillars": {
    "safety":      { "score": 95, "passed": true,  "weight": 0.25 },
    "hallucination": { "score": 82, "passed": true, "weight": 0.25 },
    "bias":        { "score": 91, "passed": true,  "weight": 0.20 },
    "prompt_security": { "score": 88, "passed": true, "weight": 0.15 },
    "compliance":  { "score": 76, "passed": true,  "weight": 0.15 }
  },
  "latency_ms": 340,
  "model": "meta/llama-guard-4-12b + meta/llama-3.1-8b-instruct"
}
```

---

## Billing & Plans

| Plan | Price | Evaluations |
|------|-------|-------------|
| Free | $0/mo | 1,000 / month |
| Grow | $49/mo | 25,000 / month |
| Scale | $199/mo | 150,000 / month |
| Enterprise | Custom | Unlimited |

See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for Stripe Dashboard configuration.

---

## Documentation

- [SDK Quickstart](aegisai-sdk/SDK_DESIGN.md)
- [Architecture](aegisai-sdk/KAN19_IMPLEMENTATION.md)
- [Stripe Setup](STRIPE_SETUP.md)
- [Contributing](CONTRIBUTING.md)

---

## License

MIT — see [LICENSE](aegisai-sdk/LICENSE)

---

<div align="center">
  <p>Built with NVIDIA NIM · FastAPI · Next.js · PostgreSQL</p>
  <p><a href="https://veldrix.ai">veldrix.ai</a> · <a href="mailto:hello@veldrix.ai">hello@veldrix.ai</a></p>
</div>
