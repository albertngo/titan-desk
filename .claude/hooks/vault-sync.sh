#!/bin/bash
# vault-sync.sh — hands-free vault writing for Titan cloud sessions
# (CONVENTIONS v2.3, 05_decisions/2026-11-22-hands-free-decision-logging).
#
# The same file sits in titan-vault, titan-agents-repo, titan-desk, titan-website and
# titan-bookkeeper at .claude/hooks/vault-sync.sh. Keep the copies identical.
#
#   vault-sync.sh clone   SessionStart: make sure /tmp/vault is a current main-vault checkout.
#   vault-sync.sh         Stop / SessionEnd: commit whatever is in /tmp/vault and push it to
#                         main-vault.
#
# Never fails the session: every path exits 0. Errors go to /tmp/vault-sync.log.
# Cloud sessions only; on a local machine it does nothing.

VAULT_DIR="/tmp/vault"
VAULT_URL="https://github.com/albertngo/titan-vault"
VAULT_BRANCH="main-vault"
LOG="/tmp/vault-sync.log"
MODE="${1:-sync}"

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

# Hooks get JSON on stdin; we don't need it, and must not block on it.
[ -t 0 ] || cat >/dev/null 2>&1

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$MODE] $*" >>"$LOG"; }

REPO="$(basename "$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$PWD}")")"

ensure_clone() {
  if git -C "$VAULT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    git -C "$VAULT_DIR" checkout -q "$VAULT_BRANCH" >>"$LOG" 2>&1
    if ! git -C "$VAULT_DIR" pull -q --rebase origin "$VAULT_BRANCH" >>"$LOG" 2>&1; then
      git -C "$VAULT_DIR" rebase --abort >/dev/null 2>&1
      log "pull --rebase failed; working on local state"
    fi
    return 0
  fi
  rm -rf "$VAULT_DIR" 2>/dev/null
  if git clone -q --depth 50 --branch "$VAULT_BRANCH" "$VAULT_URL" "$VAULT_DIR" >>"$LOG" 2>&1; then
    log "cloned $VAULT_URL ($VAULT_BRANCH) to $VAULT_DIR"
    return 0
  fi
  log "clone failed (titan-vault probably not attached to this session)"
  return 1
}

if [ "$MODE" = "clone" ]; then
  if ensure_clone; then
    echo "Vault ready at $VAULT_DIR (main-vault). Write vault notes there; the Stop hook commits and pushes them."
  else
    # SessionStart stdout is shown to Claude, so this is the recovery instruction.
    echo "VAULT NOT REACHABLE: could not clone albertngo/titan-vault to $VAULT_DIR. Before writing any vault note, call add_repo (owner albertngo, repo titan-vault, access push), then run: bash \"\$CLAUDE_PROJECT_DIR/.claude/hooks/vault-sync.sh\" clone"
  fi
  exit 0
fi

# --- sync (Stop / SessionEnd) ---
git -C "$VAULT_DIR" rev-parse --git-dir >/dev/null 2>&1 || { ensure_clone || exit 0; }

cd "$VAULT_DIR" || exit 0
git add -A >>"$LOG" 2>&1
if ! git diff --cached --quiet 2>/dev/null; then
  TS="$(date -u +%Y-%m-%dT%H:%MZ)"
  if git commit -q -m "vault: auto-log $REPO $TS" >>"$LOG" 2>&1; then
    log "committed: $(git log -1 --format=%h) ($REPO)"
  else
    log "commit failed"
  fi
fi

# Nothing unpushed? Done (the common case on every Stop).
git fetch -q origin "$VAULT_BRANCH" >>"$LOG" 2>&1
[ -z "$(git rev-list "origin/$VAULT_BRANCH..HEAD" 2>/dev/null)" ] && exit 0

for attempt in 1 2 3 4; do
  if git push -q origin "HEAD:$VAULT_BRANCH" >>"$LOG" 2>&1; then
    log "pushed $(git log -1 --format=%h) to $VAULT_BRANCH"
    exit 0
  fi
  log "push attempt $attempt failed; rebasing on origin/$VAULT_BRANCH"
  if ! git pull -q --rebase origin "$VAULT_BRANCH" >>"$LOG" 2>&1; then
    git rebase --abort >/dev/null 2>&1
    log "rebase conflict; commits kept locally in $VAULT_DIR for the next run"
    exit 0
  fi
  sleep $((attempt * 2))
done
log "push gave up after 4 attempts; commits kept locally in $VAULT_DIR for the next run"
exit 0
