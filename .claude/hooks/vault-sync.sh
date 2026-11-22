#!/bin/bash
# vault-sync.sh — hands-free vault writing for Titan sessions, cloud and local
# (CONVENTIONS v2.3, 05_decisions/2026-11-22-hands-free-decision-logging and -local).
#
# The same file sits in titan-vault, titan-agents-repo, titan-desk, titan-website and
# titan-bookkeeper at .claude/hooks/vault-sync.sh. Keep the copies identical.
#
#   vault-sync.sh clone   SessionStart: make sure the vault checkout exists and is current.
#   vault-sync.sh         Stop / SessionEnd: commit whatever is in the checkout and push it
#                         to main-vault.
#
# The checkout is /tmp/vault unless TITAN_VAULT_DIR is set (e.g. to a local Obsidian folder
# that is itself a titan-vault clone). Never fails the session: every path exits 0.
# Errors go to /tmp/vault-sync.log. Needs bash and git (Mac, Linux, WSL; not native Windows).

VAULT_DIR="${TITAN_VAULT_DIR:-/tmp/vault}"
VAULT_URLS="https://github.com/albertngo/titan-vault git@github.com:albertngo/titan-vault.git"
VAULT_BRANCH="main-vault"
LOG="/tmp/vault-sync.log"
MODE="${1:-sync}"
LOCK="/tmp/vault-sync.lock"

# Hooks get JSON on stdin; we don't need it, and must not block on it.
[ -t 0 ] || cat >/dev/null 2>&1

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$MODE] $*" >>"$LOG"; }

command -v git >/dev/null 2>&1 || { log "git not found"; exit 0; }

REPO="$(basename "$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$PWD}")")"

# One sync at a time: parallel local sessions would collide on the git index.
# A lock older than 10 minutes is a crashed run and is cleared.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null; mkdir "$LOCK" 2>/dev/null || exit 0
  else
    log "another sync is running; skipped"
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

ensure_clone() {
  if git -C "$VAULT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    git -C "$VAULT_DIR" checkout -q "$VAULT_BRANCH" >>"$LOG" 2>&1
    if ! GIT_TERMINAL_PROMPT=0 git -C "$VAULT_DIR" pull -q --rebase origin "$VAULT_BRANCH" >>"$LOG" 2>&1; then
      git -C "$VAULT_DIR" rebase --abort >/dev/null 2>&1
      log "pull --rebase failed; working on local state"
    fi
    return 0
  fi
  # Never delete a folder that holds anything: it may be someone's files.
  if [ -e "$VAULT_DIR" ] && [ -n "$(ls -A "$VAULT_DIR" 2>/dev/null)" ]; then
    log "$VAULT_DIR exists but is not a git checkout; left alone"
    return 1
  fi
  rmdir "$VAULT_DIR" 2>/dev/null
  for url in $VAULT_URLS; do
    if GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes" \
       git clone -q --depth 50 --branch "$VAULT_BRANCH" "$url" "$VAULT_DIR" >>"$LOG" 2>&1; then
      log "cloned $url ($VAULT_BRANCH) to $VAULT_DIR"
      return 0
    fi
    rm -rf "$VAULT_DIR" 2>/dev/null   # only ever our own failed, partial clone
  done
  log "clone failed over HTTPS and SSH"
  return 1
}

if [ "$MODE" = "clone" ]; then
  if ensure_clone; then
    echo "Vault ready at $VAULT_DIR (main-vault). Write vault notes there; the Stop hook commits and pushes them."
  elif [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
    # SessionStart stdout is shown to Claude, so this is the recovery instruction.
    echo "VAULT NOT REACHABLE: could not clone albertngo/titan-vault to $VAULT_DIR. Before writing any vault note, call add_repo (owner albertngo, repo titan-vault, access push), then run: bash \"\$CLAUDE_PROJECT_DIR/.claude/hooks/vault-sync.sh\" clone"
  else
    echo "VAULT NOT REACHABLE: could not clone albertngo/titan-vault to $VAULT_DIR (see /tmp/vault-sync.log; usually git isn't signed in to GitHub on this machine). Tell Albert before writing any vault note."
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

export GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes"

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
