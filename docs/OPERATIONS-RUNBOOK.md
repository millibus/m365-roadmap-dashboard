# Operations Runbook

This runbook covers operational reliability for the data update pipeline and static deployment flow.

## Operational command set

Run these from the repository root:

- `npm run preflight` - verify git/workspace baseline before making or merging changes.
- `npm run update-data` - fetch, validate, and atomically write roadmap artifacts.
- `npm run validate` - enforce data-shape correctness.
- `npm run health:check` - enforce health artifact freshness/source/data status.
- `npm test` - verify setup checks and unit tests.

## Operational artifacts

After each update run, use these artifacts for status and diagnostics:

- `data/health-status.json` - compact health artifact with source status, item count, duration, and last successful update.
- `data/update-report.json` - full update report with source URL and scheduling metadata.
- `logs/last-update-summary.json` - shell-level summary from `scripts/update.sh`.
- `data/roadmap-data-<timestamp>.json` - point-in-time backup snapshots for rollback.

## Standard update procedure

1. Run:
   ```bash
   npm run update-data
   ```
   or:
   ```bash
   npm run update
   ```
2. Validate outputs:
   ```bash
   npm run validate
   npm run health:check
   npm test
   ```
3. Confirm health:
   ```bash
   jq . data/health-status.json
   ```
4. Check key fields:
   - `status` should be `ok`
   - `source.status` should be `success`
   - `metrics.itemCount` should be non-zero for normal runs
   - `lastSuccessfulUpdate` should be recent and valid ISO time
   - `npm run health:check` should exit 0 (staleness default is 8 hours; override with `HEALTH_MAX_AGE_HOURS`)

## Incident: bad data pull

Use this flow when data is malformed, unexpectedly empty, or breaks rendering.

1. **Freeze deploy**
   - Do not run deploy until data integrity is restored.
2. **Inspect failure details**
   - Read `data/health-status.json` and `logs/last-update-summary.json`.
   - Review `logs/update-*.log` for fetch/validation errors.
3. **Restore from backup**
   - Select the latest known-good `data/roadmap-data-<timestamp>.json`.
   - Restore:
     ```bash
     cp data/roadmap-data-<timestamp>.json data/roadmap-data.json
     cp data/roadmap-data-<timestamp>.json data/roadmap-data-compact.json
     ```
4. **Re-validate**
   - Run `npm run validate`, `npm run health:check`, and `npm test`.
   - Start local server and verify dashboard renders expected states.
5. **Document incident**
   - Record root cause and impacted window in PR/issue notes.
   - Include which backup timestamp was restored.

## Rollback strategy for data artifacts

- Keep timestamped backups in `data/` (retention controlled by `BACKUP_RETENTION_COUNT`).
- Rollback is data-only unless script behavior changed.
- If script changes caused regression:
  1. Revert script commit on branch.
  2. Restore known-good data backup.
  3. Re-run `npm run validate && npm test`.
- After rollback, commit both restored data and any script fixes in one traceable change.

## Verify freshness and correctness

Use this checklist after routine updates and post-incident recovery:

1. **Freshness**
   - `data/health-status.json.timestamp` is from latest run.
   - `data/health-status.json.lastSuccessfulUpdate` is recent.
2. **Source health**
   - `data/health-status.json.source.status` is `success`.
3. **Data integrity**
   - `data/roadmap-data.json.metadata.totalItems` equals `items.length`.
   - `npm run validate` passes.
4. **Runtime behavior**
   - Dashboard loads in browser without broken view states.
   - Filters and view switching still work.

## Multi-agent execution protocol

For lane ownership, merge order, and conflict resolution rules, follow:

- `docs/CONTRIBUTOR-WORKFLOW.md`

Operational merge/deploy gate:

1. Lane owner rebases branch on latest integration branch.
2. Lane owner runs `npm run preflight`, `npm run validate`, `npm run health:check`, and `npm test`.
3. PR description includes:
   - lane ID and files owned/touched
   - health artifact snapshot (`status`, `source.status`, `metrics.itemCount`, `lastSuccessfulUpdate`)
   - rollback backup timestamp if data artifacts changed
4. Do not merge or deploy cross-lane changes until all lane owners pass the same gate on rebased branches.
