# Project Overview

`m365-roadmap-dashboard` is a static web dashboard that visualizes Microsoft 365 public roadmap items. The browser UI is implemented in vanilla HTML/CSS/JavaScript, and a separate Node.js script pipeline fetches and prepares roadmap JSON data from Microsoft's public API for local serving and GitHub Pages deployment.

## Tech Stack
- HTML5, CSS3, vanilla JavaScript (ES6) for the frontend UI
- Node.js (built-in `https`, `fs`, `path`) for data update and validation scripts
- Bash for update/deploy automation
- Static JSON files in `data/` plus browser `localStorage` cache fallback

## Architecture

This project uses a simple static-site architecture:
- Frontend app: `index.html` + `js/app.js` + `css/styles.css`
- Data pipeline: `scripts/update-data.js` fetches Microsoft API data and writes JSON snapshots
- Automation: `scripts/update.sh` orchestrates updates and optional GitHub Pages deploy flow
- Validation: `scripts/validate-data.js` verifies JSON shape; `scripts/test-setup.js` verifies project structure
- CI: `.github/workflows/ci.yml` (validate → test → lint) and `.github/workflows/security.yml` (secret scan, dep audit, policy)

### Directory Structure
```text
m365-roadmap-dashboard/
├── .github/workflows/
│   ├── ci.yml                      # CI: validate → test → lint on push/PR
│   └── security.yml                # Security: secret scan, dep audit, policy (daily + PR)
├── css/
│   └── styles.css                  # Responsive styling and UI components
├── data/
│   ├── roadmap-data.json           # Generated full dataset
│   ├── roadmap-data-compact.json   # Generated minified dataset
│   ├── sample-data.json            # Fallback sample data
│   ├── health-status.json          # Generated health artifact
│   └── update-report.json          # Generated update metadata
├── docs/
│   ├── CONTRIBUTOR-WORKFLOW.md     # Multi-agent git/worktree protocol
│   └── OPERATIONS-RUNBOOK.md       # Data recovery & operational procedures
├── js/
│   └── app.js                      # M365RoadmapDashboard app logic
├── scripts/
│   ├── update-data.js              # Fetch/process/save roadmap data
│   ├── update.sh                   # Update and optional deploy script
│   ├── health-check.js             # Validates health-status.json freshness and source health
│   ├── validate-data.js            # Validates JSON shape (metadata + items array)
│   ├── preflight.js                # Pre-work git repo baseline checks
│   ├── lint.js                     # JS syntax + JSON validity for all project files
│   ├── security-policy-check.js    # Enforces disallowed shell patterns; requires strict mode
│   └── test-setup.js               # Setup validation checks
├── tests/
│   └── unit/
│       ├── app-filters.test.js     # Filter logic tests (itemMatchesFilters, filterRoadmapItems)
│       └── update-data.test.js     # Data pipeline tests (validateApiResponse, isRoadmapItem)
├── index.html                      # SPA shell and UI markup
├── package.json                    # Scripts and project metadata
└── README.md
```

## Key Files
- `index.html` — Main application page and UI layout containers
- `js/app.js` — `M365RoadmapDashboard` class for loading, filtering, and rendering data
- `css/styles.css` — Design system, responsive layout, and view styling
- `scripts/update-data.js` — Pulls Microsoft roadmap API data and emits JSON outputs
- `scripts/update.sh` — Operational script for updates and optional GitHub Pages deployment
- `scripts/health-check.js` — Validates `data/health-status.json` freshness and source health
- `scripts/validate-data.js` — Validates JSON shape (metadata + items array with required keys)
- `scripts/preflight.js` — Pre-work git repo baseline checks (remote, branch tracking)
- `scripts/lint.js` — JS syntax (`node --check`) + JSON validity for all project files
- `scripts/security-policy-check.js` — Enforces disallowed shell patterns; requires strict mode in update.sh
- `scripts/test-setup.js` — Baseline health checks for files, structure, and data shape
- `data/roadmap-data.json` — Primary data payload served to the frontend
- `data/health-status.json` — Health artifact: status, source.status, itemCount, lastSuccessfulUpdate
- `data/update-report.json` — Update metadata: nextUpdate timestamp, apiUrl, version
- `tests/unit/app-filters.test.js` — Frontend filter unit tests
- `tests/unit/update-data.test.js` — Data pipeline unit tests
- `docs/CONTRIBUTOR-WORKFLOW.md` — Lane ownership, rebase cadence, worktree protocol
- `docs/OPERATIONS-RUNBOOK.md` — Data recovery, rollback procedures, freshness checklists
- `.github/workflows/ci.yml` — CI pipeline (Node 20, ubuntu-latest)
- `.github/workflows/security.yml` — Security scanning (gitleaks, dep audit, policy)
- `package.json` — Canonical command surface for local development and maintenance

## Entry Points
- Frontend runtime: serve `index.html` over HTTP (`npm start` or equivalent static server)
- App bootstrapping: `js/app.js` initializes dashboard behavior on page load
- Data refresh CLI: `node scripts/update-data.js`
- Automation CLI: `./scripts/update.sh` (supports `--deploy` and `--quiet`)
- Setup test CLI: `node scripts/test-setup.js`

## Common Tasks

### Running the Project
```bash
npm start
# or
npm run dev
```

### Running Tests
```bash
npm test
# or
npm run test:unit
```

### Full CI Gate (replicate CI locally before pushing)
```bash
npm run ci
```

### Pre-Work Baseline Check
```bash
npm run preflight
```

### Refreshing Data
```bash
npm run update-data
# or
node scripts/update-data.js
```

### Update + Optional Deploy
```bash
npm run update
npm run update-deploy
```

### Data Shape Validation
```bash
npm run validate
```

### Health Artifact Freshness Check
```bash
npm run health:check
```

### JS Syntax + JSON Validity
```bash
npm run lint
```

### Security Policy + Dependency Audit
```bash
npm run security:scan
```

### Building
```bash
npm run build
# note: this updates data; there is no bundling/transpile build step
```

## Code Patterns

### Class-Centered Frontend Controller
`js/app.js` uses a single `M365RoadmapDashboard` class to hold app state (`allData`, `filteredData`, `filters`, `currentView`), bind UI events, and render each view mode.

### Data Loading Fallback Chain
The frontend attempts data files in order (`roadmap-data.json`, `roadmap-data-compact.json`, `sample-data.json`) and then falls back to cached localStorage data when needed.

### Atomic File Writes
`scripts/update-data.js` writes output to a temp file then renames it to the final path, preventing partial reads if the process is interrupted mid-write.

### Exponential Backoff Retry
Fetch operations in the data pipeline retry with exponential backoff and jitter (base 1000ms, max 30s, up to 3 attempts) before failing.

### Health Artifact Chain
`scripts/update-data.js` generates `data/health-status.json` and `data/update-report.json` after each successful run. `scripts/health-check.js` reads these artifacts to validate data freshness and pipeline health.

### Multi-View Rendering
The UI renders cards, timeline, and table views from a shared filtered dataset and updates based on search/filter controls.

### Multi-Agent Lane Protocol
`docs/CONTRIBUTOR-WORKFLOW.md` defines 5 lanes (data pipeline, frontend, security, testing/CI, docs). Run `npm run preflight` before each lane starts to validate git repo state, remote, and branch tracking.

## Configuration
- `package.json` — npm scripts, node engine requirement (`>=14.0.0`), browser targets
- `.gitignore` — excludes logs, temporary files, backups, and local env files
- `OUTPUT_DIR` — output path for generated data files
- `LOG_LEVEL` — logging verbosity for scripts (`error|warn|info|debug`)
- `JSON_OUTPUT` — enables JSON summary output in script mode
- `GITHUB_TOKEN` — required for deploy flow in `scripts/update.sh --deploy`
- `GITHUB_REPO` — target repo (`owner/name`) for deployment operations
- `GH_PAGES_BRANCH` — deployment branch (defaults to `gh-pages`)

## Important Conventions
- Keep frontend assets static and host-friendly (no framework/bundler assumptions)
- Treat `data/roadmap-data*.json`, `data/health-status.json`, and `data/update-report.json` as generated artifacts — never edit them manually
- Prefer npm scripts as the operational interface over ad hoc commands
- JavaScript naming follows `PascalCase` for classes and `camelCase` for methods/variables
- CSS selectors use kebab-case naming
- CI is defined in `.github/workflows/ci.yml` (validate → test → lint) and `security.yml` (secret scan, dep audit, policy)
- Run `npm run preflight` before starting work or opening PRs (validates git repo, remote, branch tracking)
- Run `npm run ci` to replicate the full CI gate locally before pushing
- Multi-agent work: follow lane ownership protocol in `docs/CONTRIBUTOR-WORKFLOW.md`
