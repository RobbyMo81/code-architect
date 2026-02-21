# Workspace Memory

This file stores durable notes for this workspace.

## Preferences

- Keep responses concise and practical.

## Project Context

- Repository: `openclaw/openclaw`
- Local path: `/mnt/d/Documents/code-architect`

## Open Items

- Add durable facts here as they become stable.

## Operational Playbooks

- GitHub push protection (`GH013`) on `main` due to detected secrets:
  1. Inspect ahead commits: `git log --oneline origin/main..main`.
  2. Identify flagged file/lines from push error.
  3. Rewrite local-only history before push: `git reset --soft origin/main`.
  4. Remove hardcoded secret material and switch to env vars.
  5. Recommit sanitized state, then `git pull --rebase` and `git push`.
  6. Verify clean/synced state: `git status -sb` should show no ahead/dirty changes.
- For OAuth/provider plugins, never embed client IDs/secrets in source; require env vars and fail fast with explicit missing-env error messages.
