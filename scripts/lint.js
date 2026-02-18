#!/usr/bin/env node

/**
 * Lightweight lint checks without external dependencies.
 *
 * Checks:
 * - JavaScript syntax for js/ and scripts/ using `node --check`
 * - JSON parse validity for package.json and files in data/
 *
 * Exit code: 0 on pass, 1 on any failure.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const jsRoots = ['js', 'scripts', 'tests'].map((p) => path.join(projectRoot, p));
const jsonRoots = [path.join(projectRoot, 'data')];

function listFilesRecursive(dirPath, include) {
    if (!fs.existsSync(dirPath)) return [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            out.push(...listFilesRecursive(fullPath, include));
        } else if (include(entry.name)) {
            out.push(fullPath);
        }
    }
    return out;
}

function syntaxCheckJs(filePath) {
    execFileSync(process.execPath, ['--check', filePath], {
        cwd: projectRoot,
        stdio: 'pipe'
    });
}

function parseJson(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    JSON.parse(raw);
}

function main() {
    const failures = [];

    const jsFiles = jsRoots.flatMap((root) => listFilesRecursive(root, (name) => name.endsWith('.js')));
    for (const file of jsFiles) {
        try {
            syntaxCheckJs(file);
        } catch (error) {
            const rel = path.relative(projectRoot, file);
            const stderr = error && error.stderr ? String(error.stderr).trim() : error.message;
            failures.push(`[js] ${rel}\n${stderr}`);
        }
    }

    const jsonFiles = [
        path.join(projectRoot, 'package.json'),
        ...jsonRoots.flatMap((root) => listFilesRecursive(root, (name) => name.endsWith('.json')))
    ];
    for (const file of jsonFiles) {
        if (!fs.existsSync(file)) continue;
        try {
            parseJson(file);
        } catch (error) {
            failures.push(`[json] ${path.relative(projectRoot, file)}: ${error.message}`);
        }
    }

    if (failures.length > 0) {
        console.error('[lint] Lint checks failed:\n');
        failures.forEach((f) => console.error(`  - ${f}\n`));
        process.exit(1);
    }

    console.log(`[lint] Passed. Checked ${jsFiles.length} JS files and ${jsonFiles.length} JSON files.`);
}

main();
