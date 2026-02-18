# Contributor workflow and multi-agent protocol

This document defines the git and worktree workflow so multiple contributors (including automated agents) can work in parallel without colliding. Follow it when opening branches, rebasing, and merging.

## Branch naming

- **Pattern:** `agent/<lane>-<task>`
- **Examples:**
  - `agent/data-pipeline-retry` — data pipeline work (Phase 1)
  - `agent/frontend-hardening` — frontend reliability (Phase 2)
  - `agent/security-csp` — security hardening (Phase 3)
  - `agent/ci-validate` — testing/CI (Phase 4)
- **Human contributors** may use `feature/<name>` or `fix/<name>`; the same merge and rebase rules apply.

## Integration branch

- **Default branch:** `master` (or `main` if renamed). All feature/agent branches integrate into this branch.
- Keep the integration branch always runnable: `npm run preflight`, `npm run validate`, `npm run health:check`, and `npm test` should pass after every merge.

## Rebasing cadence

- **Before opening a PR:** Rebase your branch onto the current integration branch:
  ```bash
  git fetch origin
  git rebase origin/master
  ```
- **During review:** If the integration branch advances, rebase again before merge so the PR is a fast-forward where possible.
- **Do not** rebase shared or already-merged branches; only rebase your own feature/agent branch.

## Conflict avoidance

- **Ownership by lane:** Prefer one branch per “lane” (e.g. data pipeline vs frontend vs security). Avoid multiple branches editing the same set of files when possible.
- **Merge order:** When multiple agent branches are ready, merge in a defined order (e.g. Phase 1 → 2 → 3) to reduce conflicts. Resolve conflicts on the branch that introduced them (or on a small integration branch), then re-run preflight/test.
- **Conflict resolution:** The agent or human that owns the branch is responsible for resolving conflicts on that branch. After resolving, run `npm run preflight`, `npm run validate`, `npm run health:check`, and `npm test`.

## File ownership by lane

Assign one primary owner per lane. Cross-lane edits require explicit coordination in PR notes.

| Lane | Primary ownership |
|------|-------------------|
| Phase 1 - Data pipeline | `scripts/update-data.js`, `scripts/validate-data.js`, `data/roadmap-data*.json`, `tests/unit/update-data.test.js` |
| Phase 2 - Frontend reliability | `js/app.js`, `index.html` (app behavior only), `css/styles.css`, `tests/unit/app-filters.test.js` |
| Phase 3 - Security | `index.html` (headers/CSP/SRI), `scripts/update.sh`, `scripts/security-policy-check.js`, `.github/workflows/*` security jobs |
| Phase 4 - Testing/CI | `.github/workflows/ci.yml`, `package.json` scripts, shared test wiring |
| Phase 5 - Operations/docs | `README.md`, `docs/*.md`, health/runbook docs |

## Parallel execution and merge order

- **Wave 0:** Preflight baseline only.
- **Wave 1:** Phase 1, 2, and 3 run in parallel on separate `agent/<lane>-<task>` branches/worktrees.
- **Wave 2:** Phase 4 starts after Wave 1 interfaces stabilize.
- **Wave 3:** Phase 5 final docs and runbooks after command/interfaces are finalized.

Merge sequence for Wave 1 branches should remain deterministic:

1. Phase 1 branch (data contracts first)
2. Phase 2 branch (frontend reliability aligned to data shape)
3. Phase 3 branch (security overlays on stable app/scripts)
4. Phase 4 branch
5. Phase 5 branch

If two branches touch the same file, the later merge target rebases immediately after the earlier branch lands.

## Merge strategy

- **Preferred:** Squash merge for agent and short-lived feature branches so history stays linear and each PR is one commit on the integration branch.
- **Alternative:** Regular merge commit when a branch must preserve multiple meaningful commits.
- After merge, delete the feature/agent branch (and any worktree that used it) to avoid clutter.

## Worktrees (optional, for parallel agents)

Worktrees let multiple branches be checked out in separate directories so agents can run in parallel without sharing one working tree.

- **Create a worktree for an agent branch:**
  ```bash
  git worktree add ../m365-roadmap-dashboard-data agent/data-pipeline-retry
  ```
- **Convention:** Use a sibling or known path, e.g. `../m365-roadmap-dashboard-<lane>`.
- **One branch per worktree:** Do not check out the same branch in two worktrees.
- **After merge:** Remove the worktree and delete the branch:
  ```bash
  git worktree remove ../m365-roadmap-dashboard-data
  git branch -d agent/data-pipeline-retry
  ```

## Preflight before starting

From the repo root (or any worktree root), run:

```bash
npm run preflight
```

This checks:

- Git repo exists and is not bare
- Remote `origin` is configured
- Current branch has an upstream
- `README.md` and `package.json` exist

Fix any failures before starting or pushing work. CI can run the same command to ensure a consistent environment.

## Operational handoff before merge

Before handing off to another lane or merging, include this minimum handoff payload in the PR:

- Command results for `npm run validate`, `npm run health:check`, and `npm test`.
- Current `data/health-status.json` snapshot values for `status`, `source.status`, `metrics.itemCount`, and `lastSuccessfulUpdate`.
- If `data/roadmap-data*.json` changed, list the backup timestamp used for rollback reference.

## Summary

| Action              | Rule |
|---------------------|------|
| Branch name         | `agent/<lane>-<task>` (or `feature/`, `fix/` for humans) |
| Rebase before PR    | `git fetch origin && git rebase origin/master` |
| Conflicts           | Resolve on the owning branch; re-run preflight, validate, health check, and tests |
| Merge               | Prefer squash for agent/feature branches |
| Parallel work       | Use `git worktree add` for separate branches |
| Before starting     | Run `npm run preflight`; before merge run validate + health check + tests |
