# Perintah umum monorepo Raqio. Jalankan dari root repo.
# Di Windows pakai Git Bash atau `make` dari scoop/choco.

PY      ?= .venv/Scripts/python.exe
ifeq ($(wildcard $(PY)),)
PY      := python
endif
COMPOSE  = docker compose -f deploy/compose.dev.yml
GO_IMAGE = golang:1.25-alpine
# path host untuk docker -v: di Git Bash `pwd -W` memberi C:/..., di Linux/macOS jatuh ke pwd biasa
API_DIR  = $$(cd apps/api && (pwd -W 2>/dev/null || pwd))
TEST_DATABASE_URL ?= postgres://raqio:raqio@127.0.0.1:5433/raqio?sslmode=disable

.PHONY: restore-check e2e e2e-install monitoring-up monitoring-down loadtest help dev infra infra-down dev-web dev-api dev-worker test test-scraper test-api test-api-integration test-web lint build audit docker-build

help:
	@echo "make dev                  : SEMUA dari satu terminal (pwsh dev.ps1)"
	@echo "make infra                : Postgres + Redis (docker, bind 127.0.0.1)"
	@echo "make infra-down           : matikan infra dev"
	@echo "make dev-web              : Next.js di :3000"
	@echo "make dev-api              : Go API di :8080"
	@echo "make dev-worker           : worker Python (riset, ambil job dari Postgres)"
	@echo "make test                 : semua tes (tes integrasi Go dilewati tanpa Postgres)"
	@echo "make test-api-integration : tes Go dengan Postgres dev (TEST_DATABASE_URL)"
	@echo "make lint                 : lint semua app"
	@echo "make build                : build semua app"
	@echo "make audit                : npm audit, pip-audit, govulncheck (Go lewat docker)"
	@echo "make docker-build         : build image api, web, worker secara lokal"
	@echo "make e2e                  : tes ujung ke ujung Playwright (stack dev harus jalan)"
	@echo "make e2e-install          : pasang Playwright dan Chromium untuk e2e"
	@echo "make monitoring-up/down   : Prometheus + Grafana (profile monitoring, deploy/.env)"
	@echo "make loadtest             : uji beban k6 terhadap stack dev"

dev:
	powershell -ExecutionPolicy Bypass -File dev.ps1

infra:
	$(COMPOSE) up -d

infra-down:
	$(COMPOSE) down

dev-web:
	cd apps/web && npm run dev

dev-api:
	cd apps/api && go run .

dev-worker:
	cd services/scraper && $(abspath $(PY)) worker.py

test: test-scraper test-api test-web

test-scraper:
	cd services/scraper && $(abspath $(PY)) -m pytest tests -q

test-api:
	cd apps/api && mkdir -p bin/gotmp && go vet ./... && GOTMPDIR=$(abspath apps/api/bin/gotmp) go test -count=1 ./...

# butuh `make infra` (Postgres dev di 127.0.0.1:5433)
test-api-integration:
	cd apps/api && mkdir -p bin/gotmp && TEST_DATABASE_URL="$(TEST_DATABASE_URL)" ALLOW_INSECURE_WEBHOOK=1 GOTMPDIR=$(abspath apps/api/bin/gotmp) go test -count=1 -race ./...

test-web:
	cd apps/web && npx tsc --noEmit

lint:
	cd services/scraper && $(abspath $(PY)) -m ruff check .
	cd apps/api && gofmt -l . && go vet ./...
	cd apps/web && npm run lint

build:
	cd apps/api && go build -o bin/api .
	cd apps/web && npm run build

# Audit dependency, sama dengan yang dijalankan CI. govulncheck lewat container supaya tidak perlu Go lokal.
# pip-audit: `pip install pip-audit` sekali di venv.
audit:
	cd apps/web && npm audit --omit=dev --audit-level=high
	cd services/scraper && $(abspath $(PY)) -m pip_audit --strict --progress-spinner off
	MSYS_NO_PATHCONV=1 docker run --rm -v "$(API_DIR):/src" -v raqio-gocache:/go -w /src $(GO_IMAGE) \
		sh -c 'go install golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./...'

docker-build:
	docker build -t raqio/api:dev apps/api
	docker build -t raqio/web:dev apps/web
	docker build -t raqio/worker:dev services/scraper

e2e-install:
	cd e2e && npm install --no-audit --no-fund && npx playwright install chromium

e2e:
	cd e2e && npx playwright test

monitoring-up:
	docker compose -f deploy/compose.yml --env-file deploy/.env --profile monitoring up -d prometheus grafana

monitoring-down:
	docker compose -f deploy/compose.yml --env-file deploy/.env --profile monitoring stop prometheus grafana

loadtest:
	docker run --rm -i --add-host=host.docker.internal:host-gateway -e BASE=http://host.docker.internal:3000 -e USER=demo@raqio.local -e PASS=demo12345 -e VUS=5 -e DURATION=30s grafana/k6 run - < deploy/loadtest/k6-api.js

restore-check:
	docker compose -f deploy/compose.yml --env-file deploy/.env run --rm backup sh /restore-check.sh
