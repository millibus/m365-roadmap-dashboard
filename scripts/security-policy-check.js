#!/usr/bin/env node

/**
 * Security policy checks for automation scripts.
 *
 * This script blocks common high-risk shell/script patterns and validates
 * baseline hardening expectations for deployment automation.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');

const filePattern = /\.sh$/;

const disallowedPatterns = [
  {
    regex: /\bcurl\b[^\n|]*\|\s*(bash|sh)\b/i,
    message: 'Piping curl output directly to a shell is not allowed.',
  },
  {
    regex: /\bwget\b[^\n|]*\|\s*(bash|sh)\b/i,
    message: 'Piping wget output directly to a shell is not allowed.',
  },
  {
    regex: /(^|\s)eval(\s|$)/m,
    message: 'Use of eval is not allowed in project scripts.',
  },
  {
    regex: /\bgit\s+config\s+--global\b/i,
    message: 'Global git config changes are not allowed in automation scripts.',
  },
  {
    regex: /https:\/\/[^/\s]+@github\.com\//i,
    message: 'Do not embed credentials in GitHub remote URLs.',
  },
];

function listScriptFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listScriptFiles(fullPath));
      continue;
    }
    if (filePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkStrictShellMode() {
  const updateScriptPath = path.join(SCRIPTS_DIR, 'update.sh');
  if (!fs.existsSync(updateScriptPath)) {
    return ['scripts/update.sh is missing.'];
  }

  const content = fs.readFileSync(updateScriptPath, 'utf8');
  if (!content.includes('set -Eeuo pipefail')) {
    return ['scripts/update.sh must enable strict mode with "set -Eeuo pipefail".'];
  }
  return [];
}

function runPolicyChecks(files) {
  const findings = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of disallowedPatterns) {
      if (pattern.regex.test(content)) {
        findings.push(`${path.relative(PROJECT_ROOT, filePath)}: ${pattern.message}`);
      }
    }
  }
  return findings;
}

function main() {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    console.error('[security-policy] scripts directory not found.');
    process.exit(1);
  }

  const scriptFiles = listScriptFiles(SCRIPTS_DIR);
  const findings = [...checkStrictShellMode(), ...runPolicyChecks(scriptFiles)];

  if (findings.length > 0) {
    console.error('[security-policy] Policy violations found:');
    findings.forEach((finding) => console.error(`  - ${finding}`));
    process.exit(1);
  }

  console.log(`[security-policy] Passed (${scriptFiles.length} script files checked).`);
}

main();
