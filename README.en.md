# novice — a beginner-friendly Claude Code plugin

*[한국어 README](./README.md)*

A three-level learning companion plugin for non-developers starting out with Claude Code.
It preserves real development terminology and learning opportunities, helps set up external
service CLIs within a safe boundary, and reduces the fear of the CLI along with the risk of
destructive commands, runaway cost, and secret exposure.

- Spec: `docs/PRD.md` (revision 9)
- Minimum supported runtime: Claude Code `2.1.215`
- Status: MVP implemented — 123 tests passing (8 unit + 3 integration, zero external
  dependencies). Verified against a real 2.1.215 runtime via hook-payload capture and a
  `--plugin-dir` live E2E. What remains is the product beta (which needs human participants).

## Usage

| Command | Behavior |
|---|---|
| `/novice:mode` | Show current level, scope, and whether the safety gate stays on |
| `/novice:mode 1` | Level 1 (default) — explanation appended to every term, before/after narration |
| `/novice:mode 2` | Level 2 — explain on first occurrence only, narrate key decisions only |
| `/novice:mode 3` | Level 3 — explain on request only, architecture/user-flow focused |
| `/novice:mode off` | Fully remove novice tone/explanations/visualization (safety gate stays on) |

Natural-language aliases: the mode changes only when the entire prompt is exactly
`novice 1|2|3|off`. `novice reset all` / `novice reset <term>` reset the explanation counters.
A general sentence like "explain it more simply" affects only the current answer and does not
change the mode.

Terms are never simplified away. It appends an explanation after the real term, as in
`commit (recording the current changes as one save point)`, and once a term has appeared
enough times in a session (3 times at Level 1) the explanation is dropped.

## External service CLI bootstrap (2-tier)

The automation boundary for both tiers is **detect → install → log in → verify auth**.

- **Tier 1** (reviewed manifests: Vercel, GitHub CLI, Supabase): runs the standard approval
  flow with fixed package coordinates. Install and login are each approved once.
- **Tier 2** (any other CLI): the engine shows the official docs URL, package coordinate, and
  the exact argv on screen, and proceeds through the same engine only after the user confirms
  and approves the evidence. If no official provenance can be confirmed, it falls back to a
  guided manual.

Creating resources, entering env/secret values, and deploying are done by **the user
directly** or guided manually. The plugin never requests, stores, forwards, or auto-fills
credential values. For a CLI that supports secure storage (gh, supabase), auto-login is
aborted when the environment falls back to plaintext. For a CLI whose documented default is
file storage (vercel), the storage location and logout path are disclosed before the login is
approved — the per-provider policy lives in each manifest's `credential_store`.

## Safety gate threat model

| Threat | Behavior | Not guaranteed |
|---|---|---|
| Local destructive commands (`rm -rf`, PowerShell `Remove-Item`, …) | Parsed by the Bash/PowerShell finite grammars, then deny/ask | Obfuscation, novel commands, execution outside the plugin |
| Git history destruction (`push --force`, `reset --hard`, `clean`) | deny/ask based on protected branch and scope | Actions from another Git client |
| DB / remote resource deletion (CLI·MCP) | ask after showing target and environment, deny for high-risk production | Actions taken directly in an external console |
| Secret commit | scan the commit candidate tree, then deny | Unsupported formats, encrypted/obfuscated secrets |
| Secret deploy / output exposure | scan args and files (deny/ask), redact output | Values already stored remotely |
| Cost / retry loops | at most one intervention per batch | Exact billing, hard billing cap |

### Explicit non-guarantees (No silent security claims)

- **Not a general shell parser.** It parses only a single command + argv finite grammar for
  Bash and PowerShell each (Bash uses backslash escapes; PowerShell uses backtick escapes and
  backslash-as-path rules). Unsupported syntax — pipes, redirects, command substitution,
  scriptblocks, etc. — is denied if a dangerous token is present, otherwise downgraded to ask.
- **Not a full DLP, secret manager, or malicious-MCP defense.** Detection is based only on
  known-pattern fixtures.
- **timeout fail-open limit:** cases where Claude Code treats a hook timeout / forced kill as
  non-blocking are outside the guarantee. Internal hook errors, ambiguity, and input-cap
  overflow are denied (fail closed).
- **Disabling/uninstalling the plugin removes the safety gate too.** "Always-on" only means
  while the plugin is enabled. novice `off` turns off only the learning layer; the safety gate
  stays on.
- **Git protects tracked local files only.** Untracked/ignored files, external DBs, and deploy
  resources are not recoverable via a Git checkpoint.

## State and privacy

- State is stored only under `${CLAUDE_PLUGIN_DATA}` (project override, per-session term
  counters). Nothing is written to the plugin root.
- State files: atomic write, `0600`, symlink refusal, size cap. Session state is deleted on
  `/clear`, with a 30-day TTL.
- The secret scanner inspects candidate bytes in memory only and never leaves the original in
  logs/state/metrics.
- The bootstrap audit stores only service ID, manifest revision, step, and exit status.
- No remote telemetry is sent.

## Development

```bash
npm test                  # everything (unit + integration)
npm run test:unit
npm run test:integration
```

No external runtime dependencies (Node >= 18, node:test). Test layout: 8 unit files
(config·state·mode·capsule·stop·grammar·secrets·batch·bootstrap), 3 integration files
(hooks-contract·safety-corpus·safety-mutation). The safety gate is also checked by a mutation
harness — it mutates 35 dangerous commands into 106 mutants and confirms the detector is never
bypassed.

The hook-payload fixtures in `tests/fixtures/contract/` are **real Claude Code 2.1.215
captures** (the `provenance` field distinguishes captured/derived/documented — see that
directory's README). The plugin itself was also loaded on the same runtime via `--plugin-dir`
and confirmed end to end: `/novice:mode` expansion → state update → capsule injection. Still
uncaptured: the SessionStart source for `/clear`/compact and the MCP destructive payload
(cannot be triggered headlessly).
