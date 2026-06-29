# VeldrixAI Makefile
# Phase 5 LOCAL MIRROR (docker-compose.dev.yml) is the primary dev workflow.
# The legacy ad-hoc dev stack (docker-compose.yml) is preserved under `legacy-*`.

SHELL := /bin/bash
.PHONY: help \
        dev-certs dev-env dev-secrets dev-up dev-up-lean dev-policy-schema dev-migrate dev-seed dev-verify \
        dev-down dev-reset dev-logs dev-ps \
        legacy-dev legacy-dev-down legacy-dev-logs legacy-dev-rebuild \
        prod prod-down prod-logs prod-rebuild \
        clean build test db-reset db-migrate grafana prometheus traefik-dashboard health

# Phase 5 local mirror config
COMPOSE_FILE := docker-compose.dev.yml
ENV_FILE := .env.dev
COMPOSE := docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE)
PROFILES_FULL := stub,observability
PROFILES_LEAN := stub

# Default target
help:
	@echo "VeldrixAI — LOCAL dev mirror (Phase 5) — run from ~/VeldrixAI in WSL2"
	@echo ""
	@echo "First-time setup:"
	@echo "  make dev-certs    - Generate locally-trusted mkcert TLS certs"
	@echo "  make dev-env      - Create .env.dev from the example (then fill secrets)"
	@echo "  make dev-secrets  - Fill .env.dev with freshly generated dev secrets"
	@echo ""
	@echo "Local dev mirror (docker-compose.dev.yml, self-signed TLS, builds from source):"
	@echo "  make dev-up       - Bring up FULL stack (stub inference + observability)"
	@echo "  make dev-up-lean  - Bring up LEAN stack (stub only, <16GB RAM)"
	@echo "  make dev-migrate  - Apply canonical .sql set (incl. 009/011) to dev DB"
	@echo "  make dev-seed     - Seed synthetic data THROUGH the audit hash chain"
	@echo "  make dev-verify   - Verify health + isolation + stub + seed + drift"
	@echo "  make dev-down     - Stop the mirror (volumes kept)"
	@echo "  make dev-reset    - Destroy volumes, rebuild clean, re-seed"
	@echo "  make dev-logs     - Tail mirror logs    make dev-ps - status"
	@echo ""
	@echo "Legacy ad-hoc dev stack (docker-compose.yml, no gateway):"
	@echo "  make legacy-dev / legacy-dev-down / legacy-dev-logs / legacy-dev-rebuild"
	@echo ""
	@echo "Production / utilities:"
	@echo "  make prod / prod-down / prod-logs / prod-rebuild"
	@echo "  make clean / build / test / health"

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 5 — LOCAL DEV MIRROR (free WSL2 + Docker Desktop, faithful prod topology)
# ═══════════════════════════════════════════════════════════════════════════════

dev-certs:
	@bash infra/scripts/gen-certs.sh

dev-env:
	@test -f $(ENV_FILE) || { cp .env.dev.example $(ENV_FILE); \
	  echo "Created $(ENV_FILE) — fill in DEV-SCOPED secrets (or run: make dev-secrets)."; }

dev-secrets:
	@bash infra/scripts/gen-dev-env.sh

# Bring up FULL. Schema is built the SAME way prod builds it (RECON-DEV Finding 4):
# SQLAlchemy create_all() materializes every table that HAS an ORM model (incl.
# policy_active_bindings/011) and the connectors _run_migrations() boot hook applies
# the 010 audit hash-chain + append-only trigger. The ONE table with no ORM model —
# policy_documents (009) — is applied by dev-policy-schema. We do NOT psql the full
# canonical set: 000_full_schema is a baseline that overlaps 001-007 (unguarded
# CREATE TYPE) AND disagrees with the ORM (e.g. user_role vs userrole enum casing).
# `make dev-verify` (check-drift) asserts the 009/010/011 objects landed.
dev-up: dev-env
	@test -f gateway/local/certs/dev-cert.pem || { echo "Missing TLS cert — run: make dev-certs"; exit 1; }
	$(COMPOSE) up -d --build --wait postgres
	@$(MAKE) dev-policy-schema
	COMPOSE_PROFILES=$(PROFILES_FULL) $(COMPOSE) up -d --build
	@echo "✓ Full stack up (schema built by services on boot). Seed: make dev-seed"
	@echo "  App: https://dev.veldrixai.ca   API: https://api.dev.veldrixai.ca"

dev-up-lean: dev-env
	@test -f gateway/local/certs/dev-cert.pem || { echo "Missing TLS cert — run: make dev-certs"; exit 1; }
	$(COMPOSE) up -d --build --wait postgres
	@$(MAKE) dev-policy-schema
	COMPOSE_PROFILES=$(PROFILES_LEAN) $(COMPOSE) up -d --build
	@echo "✓ Lean stack up (observability omitted). Seed: make dev-seed"

# Create the one policy-engine table create_all() can't build (009 policy_documents
# has no ORM model). Idempotent; runs on a fresh DB before the services start.
dev-policy-schema:
	@COMPOSE_FILE=$(COMPOSE_FILE) ENV_FILE=$(ENV_FILE) \
	  bash infra/db/apply-policy-schema.sh

# Optional: apply the FULL canonical .sql artifacts by hand on a TRULY EMPTY DB
# (NOT a create_all-built one — 000's user_role enum disagrees with the ORM). Skips
# 001-008 (folded into the 000 baseline). For artifact review, not the dev flow.
dev-migrate:
	@COMPOSE_FILE=$(COMPOSE_FILE) ENV_FILE=$(ENV_FILE) USE_DOCKER=1 \
	  bash infra/db/bootstrap-migrations.sh

dev-seed:
	$(COMPOSE) exec -T veldrix-connectors python /seed/seed_dev.py

dev-verify:
	@COMPOSE_FILE=$(COMPOSE_FILE) ENV_FILE=$(ENV_FILE) \
	  bash infra/scripts/verify-dev-local.sh

dev-logs:
	$(COMPOSE) logs -f --tail=100

dev-ps:
	$(COMPOSE) ps

dev-down:
	COMPOSE_PROFILES=$(PROFILES_FULL) $(COMPOSE) down

dev-reset:
	COMPOSE_PROFILES=$(PROFILES_FULL) $(COMPOSE) down -v
	@$(MAKE) dev-up
	@$(MAKE) dev-seed
	@echo "✓ Dev reset to a known clean state."

# ═══════════════════════════════════════════════════════════════════════════════
# Legacy ad-hoc dev stack (docker-compose.yml — no gateway, hot-reload only)
# ═══════════════════════════════════════════════════════════════════════════════

legacy-dev:
	docker compose up -d
	@echo "Legacy dev started at http://localhost:5000 (no gateway/TLS)"

legacy-dev-down:
	docker compose down

legacy-dev-logs:
	docker compose logs -f

legacy-dev-rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d

# ═══════════════════════════════════════════════════════════════════════════════
# Production Environment
# ═══════════════════════════════════════════════════════════════════════════════

prod:
	@if [ ! -f .env.production ]; then \
		echo "ERROR: .env.production not found. Copy .env.production.example and fill in values."; \
		exit 1; \
	fi
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo "Production environment started"
	@echo "Application: https://veldrixai.ca"
	@echo "API Gateway: https://api.veldrixai.ca"

prod-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

prod-rebuild:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down
	docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# ═══════════════════════════════════════════════════════════════════════════════
# Utilities
# ═══════════════════════════════════════════════════════════════════════════════

clean:
	COMPOSE_PROFILES=$(PROFILES_FULL) $(COMPOSE) down -v --remove-orphans
	docker compose down -v --remove-orphans
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v --remove-orphans
	docker system prune -f
	@echo "All containers and volumes removed"

build:
	$(COMPOSE) build

test:
	$(COMPOSE) exec veldrix-auth pytest
	$(COMPOSE) exec veldrix-core pytest

db-reset:
	@echo "Use 'make dev-reset' for the local mirror (destroys volumes + re-seeds)."

db-migrate: dev-migrate

# ═══════════════════════════════════════════════════════════════════════════════
# Monitoring
# ═══════════════════════════════════════════════════════════════════════════════

grafana:
	@echo "Grafana at http://localhost:3001 (admin / see GRAFANA_ADMIN_PASSWORD in .env.dev)"
	@open http://localhost:3001 || xdg-open http://localhost:3001 || true

prometheus:
	@echo "Prometheus at http://localhost:9090"
	@open http://localhost:9090 || xdg-open http://localhost:9090 || true

traefik-dashboard:
	@echo "Traefik dashboard at http://localhost:8080"
	@open http://localhost:8080 || xdg-open http://localhost:8080 || true

# ═══════════════════════════════════════════════════════════════════════════════
# Health Checks
# ═══════════════════════════════════════════════════════════════════════════════

health:
	@echo "Checking service health..."
	@curl -s http://localhost:8000/health | jq . || echo "Auth: UNHEALTHY"
	@curl -s http://localhost:8001/health | jq . || echo "Core: UNHEALTHY"
	@curl -s http://localhost:8002/health | jq . || echo "Connectors: UNHEALTHY"
	@curl -s http://localhost:5000 > /dev/null && echo "Frontend: HEALTHY" || echo "Frontend: UNHEALTHY"
