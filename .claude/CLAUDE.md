## Vault Decision Log

Decisions go to Titan's vault hands-free (CONVENTIONS v2.3, Albert 2026-11-22). The rules are
the vault's `CONVENTIONS.md`, section **Hands-free decisions**. This is a pointer, not a copy.

- **Write vault notes in `/tmp/vault`**, the `main-vault` checkout the SessionStart hook makes.
  If the hook said `VAULT NOT REACHABLE`, call `add_repo` (`albertngo/titan-vault`,
  `access: "push"`), then run `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/vault-sync.sh" clone`.
  Read `/tmp/vault/CONVENTIONS.md` before the first write.
- **Whenever a decision is final** (Albert stated it, or said yes to a specific proposal),
  write `/tmp/vault/05_decisions/YYYY-MM-DD-slug.md` from `08_templates/decision.md` right
  away, without asking: time, repo, what changed, why, the final choice in his words, and the
  alternatives rejected.
- **Append only.** Create new notes. Never edit, rename or delete an existing vault note. A
  changed decision is a new note that links the old one (`Amends` / `Supersedes`).
- Don't commit or push. The Stop and SessionEnd hooks run `.claude/hooks/vault-sync.sh`, which
  commits and pushes `/tmp/vault` to `main-vault`. Errors are in `/tmp/vault-sync.log`.
- Name each new decision note in your reply in one line.
