# VeldrixAI — Google-Level Architecture

## Architecture Overview

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                     INTERNET                                 │
                                    │                    (HTTPS :443)                              │
                                    └─────────────────────────────┬───────────────────────────────┘
                                                                  │
                                    ┌─────────────────────────────▼───────────────────────────────┐
                                    │                    TRAEFIK API GATEWAY                       │
                                    │                                                              │
                                    │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
                                    │  │ Rate Limiting  │  │  SSL/TLS Off.  │  │ Load Balancing │ │
                                    │  │ (100 req/min)  │  │ (Let's Encrypt)│  │  (Round Robin)  │ │
                                    │  └────────────────┘  └────────────────┘  └────────────────┘ │
                                    │                                                              │
                                    │  ┌────────────────────────────────────────────────────────┐ │
                                    │  │                Path-Based Routing                       │ │
                                    │  │  /auth/*        → Auth Service (:8000)                  │ │
                                    │  │  /api-keys/*    → Auth Service (:8000)                  │ │
                                    │  │  /billing/*     → Auth Service (:8000)                  │ │
                                    │  │  /api/v1/*      → Core Service (:8001)                  │ │
                                    │  │  /api/analytics → Connectors (:8002)                    │ │
                                    │  │  /api/prompts   → Connectors (:8002)                    │ │
                                    │  │  /*             → Frontend (:5000)                      │ │
                                    │  └────────────────────────────────────────────────────────┘ │
                                    │                                                              │
                                    │  Port: 80 (HTTP→HTTPS redirect), 443 (HTTPS), 8080 (Admin) │
                                    └─────────────────────────────┬───────────────────────────────┘
                                                                  │
                    ┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
                    │                                             │                                             │
                    │                                             │                                             │
      ┌─────────────▼─────────────┐             ┌───────────────▼───────────────┐             ┌───────────────▼───────────────┐
      │      AUTH SERVICE         │             │       CORE SERVICE            │             │    CONNECTORS SERVICE         │
      │       (Port 8000)         │             │       (Port 8001)             │             │       (Port 8002)            │
      │                           │             │                               │             │                              │
      │  ┌─────────────────────┐  │             │  ┌─────────────────────────┐  │             │  ┌────────────────────────┐  │
      │  │   Authentication    │  │             │  │   Trust Evaluation      │  │             │  │   Analytics Engine     │  │
      │  │   - JWT Tokens      │  │             │  │   - 5 Pillar Analysis   │  │             │  │   - Time-series Data   │  │
      │  │   - bcrypt Hashing  │  │             │  │   - NVIDIA NIM Models   │  │             │  │   - Usage Metrics      │  │
      │  └─────────────────────┘  │             │  └─────────────────────────┘  │             │  └────────────────────────┘  │
      │                           │             │                               │             │                              │
      │  ┌─────────────────────┐  │             │  ┌─────────────────────────┐  │             │  ┌────────────────────────┐  │
      │  │   API Key Mgmt      │  │             │  │   Inference Router      │  │             │  │   Reports Generation   │  │
      │  │   - Key Hashing     │  │             │  │   - Model Selection     │  │             │  │   - PDF Export         │  │
      │  │   - vx-live-xxx     │  │             │  │   - Circuit Breaker     │  │             │  │   - Audit Logs         │  │
      │  └─────────────────────┘  │             │  └─────────────────────────┘  │             │  └────────────────────────┘  │
      │                           │             │                               │             │                              │
      │  ┌─────────────────────┐  │             │  ┌─────────────────────────┐  │             │  ┌────────────────────────┐  │
      │  │   Billing (Stripe)  │  │             │  │   WebSocket Server      │  │             │  │   Prompt Generator     │  │
      │  │   - Subscriptions   │  │             │  │   - Real-time Updates   │  │             │  │   - Groq-powered       │  │
      │  │   - AES-256 Vault   │  │             │  │   - Trust Alerts        │  │             │  │   - Industry Templates │  │
      │  └─────────────────────┘  │             │  └─────────────────────────┘  │             │  └────────────────────────┘  │
      │                           │             │                               │             │                              │
      │  Tech: FastAPI, uvicorn   │             │  Tech: FastAPI, NVIDIA NIM    │             │  Tech: FastAPI, PostgreSQL   │
      │  Replicas: 2              │             │  Replicas: 2                  │             │  Replicas: 1                 │
      └─────────────┬─────────────┘             └───────────────┬───────────────┘             └───────────────┬──────────────┘
                    │                                           │                                             │
                    │                                           │                                             │
                    └───────────────────────────────────────────┼─────────────────────────────────────────────┘
                                                                │
                                    ┌───────────────────────────▼───────────────────────────┐
                                    │                       REDIS                            │
                                    │                    (Port 6379)                         │
                                    │                                                        │
                                    │  ┌──────────────────────────────────────────────────┐ │
                                    │  │  Session Store (DB 0)                             │ │
                                    │  │  - JWT blacklisting                               │ │
                                    │  │  - Rate limit counters                            │ │
                                    │  └──────────────────────────────────────────────────┘ │
                                    │                                                        │
                                    │  ┌──────────────────────────────────────────────────┐ │
                                    │  │  Cache Layer (DB 1)                               │ │
                                    │  │  - Model response caching                         │ │
                                    │  │  - Circuit breaker state                          │ │
                                    │  │  - LRU eviction (256MB max)                       │ │
                                    │  └──────────────────────────────────────────────────┘ │
                                    │                                                        │
                                    │  ┌──────────────────────────────────────────────────┐ │
                                    │  │  Async Queue (DB 2)                               │ │
                                    │  │  - Background evaluation tasks                    │ │
                                    │  │  - Report generation queue                        │ │
                                    │  └──────────────────────────────────────────────────┘ │
                                    └────────────────────────────────────────────────────────┘
                                                                │
                                    ┌───────────────────────────▼───────────────────────────┐
                                    │                     POSTGRESQL                         │
                                    │                    (Port 5432)                         │
                                    │                                                        │
                                    │  ┌──────────────────────────────────────────────────┐ │
                                    │  │  Tables:                                          │ │
                                    │  │  - users (auth, billing, settings)                │ │
                                    │  │  - api_keys (hashed keys, usage limits)           │ │
                                    │  │  - notifications (user alerts)                    │ │
                                    │  │  - payment_history (Stripe transactions)          │ │
                                    │  │  - payment_otp_vault (AES-256 encrypted)          │ │
                                    │  │  - reports (generated trust reports)              │ │
                                    │  │  - audit_trails (compliance logs)                 │ │
                                    │  │  - saved_prompts (prompt library)                 │ │
                                    │  └──────────────────────────────────────────────────┘ │
                                    │                                                        │
                                    │  Extensions: uuid-ossp, pg_trgm (search)              │
                                    │  Max Connections: 100                                  │
                                    └────────────────────────────────────────────────────────┘

                                    ┌────────────────────────────────────────────────────────┐
                                    │                    OBSERVABILITY                        │
                                    │                                                         │
                                    │  ┌─────────────────┐    ┌─────────────────────────────┐ │
                                    │  │   PROMETHEUS    │    │         GRAFANA              │ │
                                    │  │   (Port 9090)   │───▶│        (Port 3001)           │ │
                                    │  │                 │    │                              │ │
                                    │  │  - Traefik      │    │  - Latency P50/P95/P99       │ │
                                    │  │  - Auth metrics │    │  - Request rate per service  │ │
                                    │  │  - Core metrics │    │  - Error rate by endpoint    │ │
                                    │  │  - Redis stats  │    │  - Database connections      │ │
                                    │  └─────────────────┘    └─────────────────────────────┘ │
                                    │                                                         │
                                    └─────────────────────────────────────────────────────────┘
```

## Service Endpoints

### Auth Service (Port 8000)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | User registration |
| `/auth/login` | POST | JWT token issuance |
| `/auth/me` | GET | Current user profile |
| `/api-keys` | GET, POST | API key management |
| `/billing/status` | GET | Subscription status |
| `/billing/checkout` | POST | Stripe checkout session |

### Core Service (Port 8001)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/evaluate` | POST | Trust evaluation |
| `/api/v1/analyze` | POST | Detailed pillar analysis |
| `/api/v1/stream` | GET | SSE real-time updates |
| `/ws/notifications/{user_id}` | WS | WebSocket notifications |

### Connectors Service (Port 8002)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analytics` | GET | Usage analytics |
| `/api/reports` | GET, POST | Report generation |
| `/api/prompts` | GET, POST | Prompt library |
| `/api/prompts/generate-advanced` | POST | AI prompt generation |
| `/api/models` | GET | Available AI models |

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SECURITY LAYERS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: Network Security                                                   │
│  ├── Traefik TLS 1.3 termination                                            │
│  ├── HSTS (Strict-Transport-Security: max-age=31536000)                     │
│  ├── Rate limiting (100 req/min per IP)                                     │
│  └── CORS (whitelisted origins only)                                        │
│                                                                              │
│  Layer 2: Authentication                                                     │
│  ├── JWT RS256 tokens (24h expiry)                                          │
│  ├── bcrypt password hashing (cost=12)                                      │
│  ├── API keys with vx-live-xxx prefix (bcrypt hashed, irreversible)        │
│  └── Redis-based token blacklisting                                          │
│                                                                              │
│  Layer 3: Data Protection                                                    │
│  ├── AES-256-GCM encryption for sensitive data (vault.py)                   │
│  ├── 96-bit random nonce per encryption                                     │
│  ├── 128-bit GCM authentication tag (tamper detection)                      │
│  └── Environment-injected vault key (VELDRIX_VAULT_KEY)                     │
│                                                                              │
│  Layer 4: Infrastructure                                                     │
│  ├── Non-root Docker containers (uid=1001)                                  │
│  ├── Isolated bridge network (veldrix-network)                              │
│  ├── Secrets via environment (no .env in image)                             │
│  └── Health checks with automatic restart                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Deployment Commands

```bash
# Development
make dev          # Start all services with hot-reload
make dev-logs     # Tail logs
make dev-down     # Stop services

# Production
make prod         # Start production stack
make prod-logs    # Tail logs
make prod-down    # Stop services

# Monitoring
make grafana      # Open Grafana dashboards
make prometheus   # Open Prometheus UI
make health       # Check all service health
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `JWT_SECRET` | Yes | 32-byte JWT signing secret |
| `VELDRIX_VAULT_KEY` | Yes | Base64-encoded AES-256 key |
| `NVIDIA_API_KEY` | Yes | NVIDIA NIM API key |
| `GROQ_API_KEY` | No | Groq API for prompt generation |
| `STRIPE_SECRET_KEY` | No | Stripe billing key |
| `ACME_EMAIL` | No | Let's Encrypt email |

## Compliance

This architecture satisfies:
- **SOC 2 Type II** — CC6.1 (access control), CC6.7 (data at rest)
- **GDPR Article 32** — Technical measures for personal data
- **HIPAA § 164.312(a)(2)(iv)** — ePHI encryption
- **PCI-DSS Requirement 3.5** — Cardholder data protection