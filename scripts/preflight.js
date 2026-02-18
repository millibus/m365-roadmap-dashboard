#!/usr/bin/env node

/**
 * Preflight checks for M365 Roadmap Dashboard
 *
 * Validates repo health and baseline artifacts before development or CI:
 * - Git repository state (not bare, has remote, branch tracking)
 * - Required baseline files (README.md, package.json)
 *
 * Exit code: 0 if all checks pass, 1 otherwise.
 * Use before starting work or in CI to ensure a consistent environment.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(path.dirname(__dirname));
let failed = false;

function log(level, message) {
  const prefix = level === 'error' ? '\x1b[31m[PREFLIGHT]\x1b[0m' : '\x1b[32m[PREFLIGHT]\x1b[0m';
  console.log(`${prefix} ${message}`);
}

function check(name, fn) {
  try {
    fn();
    return true;
  } catch (e) {
    log('error', `${name}: ${e.message}`);
    failed = true;
    return false;
  }
}

function requireFile(relPath, description) {
  const fullPath = path.join(projectRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing ${description}: ${relPath}`);
  }
  log('ok', `Found ${relPath}`);
}

function git(...args) {
  return execSync(`git ${args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(' ')}`, {
    encoding: 'utf8',
    cwd: projectRoot,
  }).trim();
}

// --- Baseline files
check('README.md', () => requireFile('README.md', 'README'));
check('package.json', () => requireFile('package.json', 'package manifest'));

// --- Git repository
check('Git repository', () => {
  const gitDir = path.join(projectRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error('Not a git repository (no .git directory)');
  }
  const stat = fs.statSync(gitDir);
  if (stat.isFile()) {
    const content = fs.readFileSync(gitDir, 'utf8');
    if (content.startsWith('gitdir: ')) {
      // worktree: .git is a file pointing to the actual git dir
    } else {
      throw new Error('Invalid .git (expected directory or worktree reference)');
    }
  }
  log('ok', 'Repository is a valid git repo');
});

check('Git remote', () => {
  let remotes;
  try {
    remotes = git('remote', '-v');
  } catch {
    throw new Error('Could not list remotes');
  }
  if (!remotes || !remotes.includes('origin')) {
    throw new Error('No "origin" remote configured. Run: git remote add origin <url>');
  }
  log('ok', 'Remote "origin" is configured');
});

check('Branch tracking', () => {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (!branch || branch === 'HEAD') {
    throw new Error('Detached HEAD; check out a branch');
  }
  let upstream;
  try {
    upstream = git('rev-parse', '--abbrev-ref', 'HEAD@{upstream}');
  } catch {
    upstream = null;
  }
  if (!upstream) {
    throw new Error(
      `Branch "${branch}" has no upstream. Set with: git branch --set-upstream-to=origin/${branch} ${branch}`
    );
  }
  log('ok', `Branch "${branch}" tracks ${upstream}`);
});

if (failed) {
  process.exit(1);
}
process.exit(0);
