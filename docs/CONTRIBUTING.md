# Contributing to VeldrixAI

Thank you for your interest in contributing to VeldrixAI. This guide covers how to set up your development environment and submit changes.

---

## Repository Structure

```
veldrixai/
├── backend/
│   ├── auth/          # Auth service (FastAPI, port 8000)
│   ├── core/          # Trust engine (FastAPI, port 8001)
│   └── connectors/    # Analytics & reports (FastAPI, port 8002)
├── frontend/          # Dashboard (Next.js, port 5000)
├── sdk/               # Python SDK (veldrixai package)
├── docs/              # Documentation assets
└── .github/           # CI workflows and issue templates
```

---

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker Desktop
- An NVIDIA NIM API key (for integration tests)

### 1. Clone the repository

```bash
git clone https://github.com/VeldrixAI/veldrixai.git
cd veldrixai
```

### 2. Copy and configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in NVIDIA_API_KEY and other required values
```

### 3. Start all services with Docker Compose

```bash
make dev
# or: docker-compose up --build
```

### 4. Run backend tests

```bash
make test-backend-core
```

### 5. Run SDK tests

```bash
make test-sdk
```

### 6. Run frontend in dev mode

```bash
make dev-frontend
# or: cd frontend && npm install && npm run dev
```

---

## Making Changes

1. Fork the repository and create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes. Follow the existing code style:
   - Python: [Ruff](https://docs.astral.sh/ruff/) is used for linting (`make lint`)
   - TypeScript: ESLint config is in `frontend/eslint.config.mjs`

3. Add or update tests for your changes.

4. Run `make lint` and `make test` before opening a pull request.

5. Open a pull request against `main` using the provided PR template.

---

## Commit Style

Use conventional commits:

```
feat: add webhook event system for trust alerts
fix: correct score normalization in bias pillar
docs: update SDK quickstart example
chore: bump NVIDIA NIM model defaults
```

---

## Reporting Issues

Use the GitHub issue templates:
- **Bug report** — for unexpected behavior or errors
- **Feature request** — for new functionality proposals

For security vulnerabilities, do NOT open a public issue. See [SECURITY.md](SECURITY.md).
