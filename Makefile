# Perintah umum monorepo Raqio. Jalankan dari root repo.
# Di Windows pakai Git Bash atau `make` dari scoop/choco.

PY      ?= .venv/Scripts/python.exe
ifeq ($(wildcard $(PY)),)
PY      := python
endif
COMPOSE  = docker compose -f deploy/compose.dev.yml

.PHONY: help infra infra-down dev-web dev-api dev-scraper test test-scraper test-api test-web lint build

help:
	@echo "make infra        : Postgres + Redis (docker)"
	@echo "make infra-down   : matikan infra dev"
	@echo "make dev-web      : Next.js di :3000"
	@echo "make dev-api      : Go API di :8080"
	@echo "make dev-scraper  : service Python di :8000"
	@echo "make test         : semua tes"
	@echo "make lint         : lint semua app"
	@echo "make build        : build semua app"

infra:
	$(COMPOSE) up -d

infra-down:
	$(COMPOSE) down

dev-web:
	cd apps/web && npm run dev

dev-api:
	cd apps/api && go run .

dev-scraper:
	cd services/scraper && $(abspath $(PY)) app.py

test: test-scraper test-api test-web

test-scraper:
	cd services/scraper && $(abspath $(PY)) -m pytest tests -q

test-api:
	cd apps/api && go vet ./... && go test ./...

test-web:
	cd apps/web && npx tsc --noEmit

lint:
	cd services/scraper && $(abspath $(PY)) -m ruff check .
	cd apps/api && gofmt -l . && go vet ./...
	cd apps/web && npm run lint

build:
	cd apps/api && go build -o bin/api .
	cd apps/web && npm run build
