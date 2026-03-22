.PHONY: dev build test lint clean sdk-build sdk-publish

# ── Local development ─────────────────────────────────────────────────────────
dev:
	docker-compose up --build

dev-backend-auth:
	cd backend/auth && uvicorn app.main:app --reload --port 8000

dev-backend-core:
	cd backend/core && uvicorn src.main:app --reload --port 8001

dev-backend-connectors:
	cd backend/connectors && uvicorn src.main:app --reload --port 8002

dev-frontend:
	cd frontend && npm run dev

# ── Testing ───────────────────────────────────────────────────────────────────
test:
	cd backend/core && pytest tests/ -v --tb=short
	cd sdk && pytest tests/ -v --tb=short

test-backend-core:
	cd backend/core && pytest tests/ -v --tb=short

test-sdk:
	cd sdk && pytest tests/ -v --tb=short

# ── Linting ───────────────────────────────────────────────────────────────────
lint:
	cd backend/core && ruff check src/ tests/
	cd sdk && ruff check veldrixai/ tests/
	cd frontend && npm run lint

# ── SDK publishing ────────────────────────────────────────────────────────────
sdk-build:
	cd sdk && python -m build

sdk-publish-test:
	cd sdk && twine upload --repository testpypi dist/*

sdk-publish:
	cd sdk && twine upload dist/*

# ── Docker ────────────────────────────────────────────────────────────────────
build:
	docker-compose build

clean:
	docker-compose down -v
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -name "*.pyc" -delete
