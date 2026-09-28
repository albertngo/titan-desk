#!/usr/bin/env bash
# Plain-Postgres stand-in for `supabase --workdir db {start,db reset,test db}`.
#
# Used where the Supabase CLI/Docker are unavailable (this repo was bootstrapped in
# such a container). It applies:
#   1. scripts/supabase_shim.sql  — roles, auth/extensions/storage schemas Supabase provides
#   2. scripts/pgtap_shim.sql     — the pgTAP subset the tests use (skipped if pgTAP exists)
#   3. supabase/migrations/*.sql  — the real migrations, unchanged
#   4. supabase/seed.sql
# and runs supabase/tests/*.sql as TAP, failing on any "not ok".
#
# Usage: db/scripts/local-pg.sh start|reset|test|stop|psql
set -euo pipefail
shopt -s nullglob

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
DBNAME="${TITAN_TEST_DB:-titan_desk_test}"
PGUSER_ADMIN="${TITAN_PG_ADMIN:-postgres}"

# Connection for administrative work. Prefer a local socket as the postgres OS user.
psql_admin() {
  if [[ -n "${TITAN_PG_ADMIN_URL:-}" ]]; then
    psql "$TITAN_PG_ADMIN_URL" "$@"
  elif [[ "$(id -u)" == "0" ]] && id postgres >/dev/null 2>&1; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"
  else
    psql -v ON_ERROR_STOP=1 -U "$PGUSER_ADMIN" "$@"
  fi
}

start() {
  if command -v pg_lsclusters >/dev/null 2>&1; then
    if pg_lsclusters | awk 'NR>1 && $4=="online"' | grep -q .; then
      echo "postgres already online"
    else
      pg_ctlcluster "$(pg_lsclusters | awk 'NR==2{print $1}')" main start
    fi
  fi
  psql_admin -Atc "select 'ok: ' || version()"
}

reset() {
  psql_admin -d postgres -c "drop database if exists \"$DBNAME\" with (force)" >/dev/null
  psql_admin -d postgres -c "create database \"$DBNAME\"" >/dev/null
  psql_admin -d "$DBNAME" -q -f "$HERE/supabase_shim.sql"
  if ! psql_admin -d "$DBNAME" -Atc "select 1 from pg_available_extensions where name='pgtap'" | grep -q 1; then
    psql_admin -d "$DBNAME" -q -f "$HERE/pgtap_shim.sql"
  else
    psql_admin -d "$DBNAME" -q -c "create extension if not exists pgtap"
  fi
  for m in "$DB_DIR"/supabase/migrations/*.sql; do
    echo "applying $(basename "$m")"
    psql_admin -d "$DBNAME" -q -f "$m"
  done
  # Local only: the worker's roundtrip tests connect as the restricted role over TCP.
  psql_admin -d "$DBNAME" -q -c "alter role sync_worker with login password 'sync_worker'"
  psql_admin -d "$DBNAME" -q -c "alter role askbert_reader with login password 'askbert_reader'"
  psql_admin -d "$DBNAME" -q -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'titan_test_reader') then create role titan_test_reader login password 'reader' in role authenticated; end if; end \$\$"
  if [[ -f "$DB_DIR/supabase/seed.sql" ]]; then
    echo "seeding"
    psql_admin -d "$DBNAME" -q -f "$DB_DIR/supabase/seed.sql"
  fi
  echo "reset ok: $DBNAME"
}

run_tests() {
  local fail=0 total=0
  for t in "$DB_DIR"/supabase/tests/*.sql; do
    echo "== $(basename "$t")"
    local out
    if ! out="$(psql_admin -d "$DBNAME" -qAt -f "$t" 2>&1)"; then
      echo "$out" | tail -20
      echo "!! psql error in $(basename "$t")"
      fail=1
      continue
    fi
    echo "$out" | grep -E '^(not ok|ok|1\.\.|# )' | grep -vE '^ok ' || true
    local nok
    nok=$(echo "$out" | grep -c '^not ok' || true)
    local n
    n=$(echo "$out" | grep -c '^ok' || true)
    total=$((total + n))
    if [[ "$nok" != "0" ]]; then fail=1; fi
    echo "   $n passed, $nok failed"
  done
  echo "TOTAL passed: $total"
  if [[ "$fail" != "0" ]]; then echo "FAILED"; exit 1; fi
  echo "ALL TESTS PASSED"
}

case "${1:-}" in
  start) start ;;
  reset) reset ;;
  test) run_tests ;;
  stop) pg_ctlcluster "$(pg_lsclusters | awk 'NR==2{print $1}')" main stop ;;
  psql) shift; psql_admin -d "$DBNAME" "$@" ;;
  *) echo "usage: $0 start|reset|test|stop|psql [args]"; exit 2 ;;
esac
