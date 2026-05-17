# VeldrixAI Makefile
# Google-level deployment automation

.PHONY: help dev dev-down dev-logs prod prod-down prod-logs clean build test

# Default target
help:
	@echo "VeldrixAI Deployment Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment with hot-reload"
	@echo "  make dev-down     - Stop development environment"
	@echo "  make dev-logs     - Tail development logs"
	@echo "  make dev-rebuild  - Rebuild development containers"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start production environment"
	@echo "  make prod-down    - Stop production environment"
	@echo "  make prod-logs    - Tail production logs"
	@echo "  make prod-rebuild - Rebuild production containers"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean        - Remove all containers, volumes, and caches"
	@echo "  make build        - Build all Docker images"
	@echo "  make test         - Run all tests"
	@echo "  make db-reset     - Reset database (development only)"
	@echo "  make db-migrate   - Run database migrations"

# ═══════════════════════════════════════════════════════════════════════════════
# Development Environment
# ═══════════════════════════════════════════════════════════════════════════════

dev:
	docker compose up -d
	@echo "Development environment started at http://localhost:5000"
	@echo "API Gateway: http://localhost:80"
	@echo "Auth API: http://localhost:8000/docs"
	@echo "Core API: http://localhost:8001/docs"
	@echo "Connectors: http://localhost:8002/docs"

dev-down:
	docker compose down

dev-logs:
	docker compose logs -f

dev-rebuild:
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
	@echo "Grafana: http://localhost:3001"
	@echo "Prometheus: http://localhost:9090"

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
	docker compose down -v --remove-orphans
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v --remove-orphans
	docker system prune -f
	@echo "All containers and volumes removed"

build:
	docker compose build
	docker compose -f docker-compose.yml -f docker-compose.prod.yml build

test:
	docker compose exec veldrix-auth pytest
	docker compose exec veldrix-core pytest

db-reset:
	@echo "Resetting development database..."
	docker compose down -v postgres_dev_data
	docker compose up -d postgres
	@sleep 5
	docker compose exec postgres psql -U veldrix -d veldrix_dev -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
	@echo "Database reset complete"

db-migrate:
	@echo "Running migrations..."
	for file in backend/auth/migrations/*.sql; do \
		echo "Applying $$file..."; \
		docker compose exec -T postgres psql -U veldrix -d veldrix_dev -f /dev/stdin < $$file; \
	done
	@echo "Migrations complete"

# ═══════════════════════════════════════════════════════════════════════════════
# Monitoring
# ═══════════════════════════════════════════════════════════════════════════════

grafana:
	@echo "Opening Grafana at http://localhost:3001"
	@echo "Default credentials: admin / veldrix2024"
	open http://localhost:3001 || xdg-open http://localhost:3001

prometheus:
	@echo "Opening Prometheus at http://localhost:9090"
	open http://localhost:9090 || xdg-open http://localhost:9090

traefik-dashboard:
	@echo "Opening Traefik Dashboard at http://localhost:8080"
	open http://localhost:8080 || xdg-open http://localhost:8080

# ═══════════════════════════════════════════════════════════════════════════════
# Health Checks
# ═══════════════════════════════════════════════════════════════════════════════

health:
	@echo "Checking service health..."
	@curl -s http://localhost:8000/health | jq . || echo "Auth: UNHEALTHY"
	@curl -s http://localhost:8001/health | jq . || echo "Core: UNHEALTHY"
	@curl -s http://localhost:8002/health | jq . || echo "Connectors: UNHEALTHY"
	@curl -s http://localhost:5000 > /dev/null && echo "Frontend: HEALTHY" || echo "Frontend: UNHEALTHY"