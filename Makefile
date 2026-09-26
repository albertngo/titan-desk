SHELL := /bin/bash
.DEFAULT_GOAL := help

SUPABASE ?= supabase --workdir db
PY ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
PYTHON := $(VENV)/bin/python
TITAN_TEST_DB ?= titan_desk_test

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-16s %s\n", $$1, $$2}'

# ---------- database ----------
db-start: ## start Supabase locally (falls back to the plain-Postgres harness)
	@if command -v supabase >/dev/null 2>&1; then $(SUPABASE) start; else db/scripts/local-pg.sh start; fi

db-reset: ## apply migrations + seed on a fresh database
	@if command -v supabase >/dev/null 2>&1; then $(SUPABASE) db reset; else db/scripts/local-pg.sh reset; fi

db-test: ## run pgTAP tests
	@if command -v supabase >/dev/null 2>&1; then $(SUPABASE) test db; else db/scripts/local-pg.sh test; fi

db-stop: ## stop the local database
	@if command -v supabase >/dev/null 2>&1; then $(SUPABASE) stop; else db/scripts/local-pg.sh stop; fi

types: ## regenerate web/src/lib/db/types.gen.ts (needs the Supabase CLI)
	$(SUPABASE) gen types typescript --local --schema api > web/src/lib/db/types.gen.ts

# ---------- sync worker ----------
$(VENV)/bin/activate:
	$(PY) -m venv $(VENV)
	$(PIP) install -e "sync[dev]"

sync-install: $(VENV)/bin/activate ## create venv and install the worker

sync-test: sync-install ## run the worker's pytest suite (roundtrip needs a running local db)
	cd sync && ../$(PYTEST) -q

sync-inc: sync-install ## run one incremental sync against $$DATABASE_URL
	cd sync && ../$(PYTHON) -m titan_sync.run --mode incremental

sync-full: sync-install ## run one full sync
	cd sync && ../$(PYTHON) -m titan_sync.run --mode full

sync-images: sync-install ## drain the image backlog
	cd sync && ../$(PYTHON) -m titan_sync.run --mode images

sync-purge: sync-install ## purge variants of long-deleted images
	cd sync && ../$(PYTHON) -m titan_sync.run --mode purge

# ---------- web ----------
web-install: ## npm install
	cd web && npm install

web-dev: ## next dev
	cd web && npm run dev

web-check: ## lint + typecheck + unit tests
	cd web && npm run lint && npm run typecheck && npm test

test: db-test sync-test ## everything that runs without npm

.PHONY: help db-start db-reset db-test db-stop types sync-install sync-test sync-inc sync-full sync-images sync-purge web-install web-dev web-check test
