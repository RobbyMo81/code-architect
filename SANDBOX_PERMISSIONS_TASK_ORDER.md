# OpenClaw Sandboxing and Permissions Investigation + Task Order

Date: 2026-02-21  
Owner: Codex (implementation), Peter (approval authority)

## 1. Purpose

This document records the investigation into sandboxing and permission-related failures and proposes a task order to fully resolve them.  
After your approval, this becomes the contract of work and the single source of truth for execution status.

## 2. Executive Summary

- The primary blocker is execution sandbox policy, not Unix ownership/mode on `~/.openclaw`.
- OpenClaw defaults to writing state under `~/.openclaw`, but this agent session can only write to:
  - `/mnt/d/Documents/code-architect`
  - `/tmp`
- Result: commands that need writes under `~/.openclaw` fail in sandbox mode (for example memory SQLite and config writes), even when filesystem permissions are correct.
- Elevated execution confirms host-mode behavior is healthy: memory status and config writes work against `~/.openclaw`.

## 3. Scope Investigated

- `openclaw` process/runtime status
- `memory.md` missing-file complaint
- Memory database initialization path and write behavior
- OpenClaw config write path behavior
- Related sandbox-sensitive commands (`ss -ltnp`, global npm install path interactions)

## 4. Evidence Collected

## 4.1 Filesystem ownership and mode are aligned

- `~/.openclaw` is `drwx------` (`700`) owned by `robbymo:robbymo`
- `~/.openclaw/openclaw.json` is `-rw-------` (`600`) owned by `robbymo:robbymo`
- `~/.openclaw/memory` was created and set to `700`

Conclusion: standard Linux permissions are not the root cause.

## 4.2 Sandbox write boundary is the root blocker

Write test results:

- Write to `/mnt/d/Documents/code-architect`: success
- Write to `/tmp`: success
- Write to `/home/robbymo/.openclaw`: denied by sandbox (`Permission denied`)

This exactly matches the configured writable roots for this agent session.

## 4.3 OpenClaw behavior in sandbox vs host mode

Sandbox mode (no elevation):

- `openclaw memory status` -> `unable to open database file`
- `openclaw config set messages.ackReactionScope group-mentions` -> `EACCES` on temp file under `~/.openclaw`

Host mode (elevated execution):

- `openclaw memory status --json` succeeds using DB path:
  - `/home/robbymo/.openclaw/memory/main.sqlite`
- `openclaw config set messages.ackReactionScope group-mentions` succeeds and writes config

Conclusion: OpenClaw itself is functioning; the failure boundary is sandbox policy.

## 4.4 Sandbox-compatible workaround validated

Using:

- `OPENCLAW_STATE_DIR=/mnt/d/Documents/code-architect/.openclaw-sandbox`

Result:

- `openclaw memory status --json` succeeds in sandbox mode
- DB path resolves to:
  - `/mnt/d/Documents/code-architect/.openclaw-sandbox/memory/main.sqlite`

This proves we can run OpenClaw fully in sandbox without elevation if state is redirected into writable roots.

## 4.5 Related constraints observed

- `ss -ltnp` in sandbox cannot fully inspect process owners and reports netlink permission limits.
- Global npm operations may require elevated execution depending on target install path outside writable roots.

## 5. Root Cause Analysis

Primary root cause:

- Policy mismatch between:
  - OpenClaw default mutable state location: `~/.openclaw`
  - Current coding-agent writable sandbox roots: repo + `/tmp` only

Secondary contributing factors:

- Some diagnostic and process-inspection commands require privileges not available in sandbox.
- Tooling behavior may be misread as filesystem permission problems unless policy boundaries are tested directly.

## 6. Decisions Needed (Approval Gate)

Choose one operating model as the standard for this environment:

1. Model A: Host state + elevated execution
- Keep OpenClaw state in `~/.openclaw`
- Use elevated commands whenever writes under home are required

2. Model B: Sandbox-native state (recommended for this agent session)
- Set `OPENCLAW_STATE_DIR` to a repo path (for example `.openclaw-sandbox`)
- Keep all mutable state inside writable roots
- Avoid repeated elevation prompts for routine OpenClaw commands

3. Model C: Hybrid
- Daily work in sandbox-native state
- Explicit elevated checks only for production/home-state parity

## 7. Proposed Task Order (Pending Your Approval)

Status legend: `proposed`, `in_progress`, `completed`, `blocked`

| ID | Task | Status | Approval Required | Completion Criteria |
|---|---|---|---|---|
| T1 | Lock operating model (A/B/C) | proposed | Yes | You select model and constraints |
| T2 | Implement environment baseline for chosen model | proposed | Yes | Commands run without permission failures in expected mode |
| T3 | Validate memory subsystem end-to-end (`status`, `index`, `search`) | proposed | Yes | All three commands run and return non-error outputs |
| T4 | Validate config write/read cycle and restart guidance | proposed | Yes | `config set/get` works under selected model |
| T5 | Document command policy (when elevation is required vs not) | proposed | Yes | Operator playbook added to this document |
| T6 | Regression checklist and sign-off evidence capture | proposed | Yes | Final verification matrix completed |

## 8. Initial Execution Plan (Will Start Only After Approval)

1. Confirm selected model (A/B/C).
2. Apply minimal config/env changes for that model.
3. Run verification matrix:
- `openclaw memory status`
- `openclaw memory status --index`
- `openclaw memory search "test"`
- `openclaw config get ...`
- `openclaw config set ...`
4. Record outputs and mark each task status here.
5. Provide final sign-off summary with residual risks.

## 9. Risks and Controls

- Risk: state split between `~/.openclaw` and sandbox path.
  - Control: choose one canonical model and codify it in this document.
- Risk: repeated elevation prompts slow operations.
  - Control: Model B or C; use approved command prefixes where appropriate.
- Risk: false diagnosis of filesystem mode issues.
  - Control: always run write-boundary matrix before chmod/chown changes.

## 10. Change Log (for this contract document)

- 2026-02-21: Initial investigation completed and task order drafted.

