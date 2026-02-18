#!/usr/bin/env node

/**
 * Operational health check for generated roadmap artifacts.
 *
 * Validates `data/health-status.json` and optionally `data/update-report.json`
 * to ensure update freshness and source/data status are still healthy.
 *
 * Usage:
 *   node scripts/health-check.js [--json] [--max-age-hours <hours>]
 *
 * Environment variables:
 *   HEALTH_MAX_AGE_HOURS: staleness threshold (default: 8)
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const HEALTH_FILE = path.join(DATA_DIR, 'health-status.json');
const REPORT_FILE = path.join(DATA_DIR, 'update-report.json');

function parseNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function parseArgs(argv) {
    let jsonOutput = false;
    let maxAgeHours = parseNumber(process.env.HEALTH_MAX_AGE_HOURS || '8');

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--json') {
            jsonOutput = true;
            continue;
        }
        if (arg === '--max-age-hours') {
            const value = argv[i + 1];
            if (value == null) {
                throw new Error('--max-age-hours requires a value');
            }
            i += 1;
            maxAgeHours = parseNumber(value);
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    if (maxAgeHours == null || maxAgeHours <= 0) {
        throw new Error('max age must be a positive number of hours');
    }

    return { jsonOutput, maxAgeHours };
}

function loadJson(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found at ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function toIso(value) {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : new Date(ts).toISOString();
}

function validateHealth(health, now, maxAgeHours) {
    const errors = [];
    const warnings = [];

    if (!health || typeof health !== 'object') {
        return { errors: ['health-status must be an object'], warnings, summary: {} };
    }

    const status = health.status || 'unknown';
    const sourceStatus = health.source && health.source.status ? health.source.status : 'unknown';
    const itemCount = health.metrics && typeof health.metrics.itemCount === 'number'
        ? health.metrics.itemCount
        : null;
    const timestampIso = toIso(health.timestamp);
    const lastSuccessIso = toIso(health.lastSuccessfulUpdate);

    if (status !== 'ok') {
        errors.push(`health status is "${status}" (expected "ok")`);
    }
    if (sourceStatus !== 'success') {
        errors.push(`source status is "${sourceStatus}" (expected "success")`);
    }
    if (itemCount == null) {
        errors.push('metrics.itemCount is missing');
    } else if (itemCount <= 0) {
        errors.push(`metrics.itemCount is ${itemCount} (expected > 0)`);
    }
    if (!timestampIso) {
        warnings.push('timestamp is missing or invalid');
    }
    if (!lastSuccessIso) {
        errors.push('lastSuccessfulUpdate is missing or invalid');
    } else {
        const ageMs = now.getTime() - Date.parse(lastSuccessIso);
        const ageHours = ageMs / (60 * 60 * 1000);
        if (ageHours > maxAgeHours) {
            errors.push(
                `lastSuccessfulUpdate is stale (${ageHours.toFixed(2)}h old, threshold ${maxAgeHours}h)`
            );
        }
    }

    return {
        errors,
        warnings,
        summary: {
            status,
            sourceStatus,
            itemCount,
            timestamp: timestampIso,
            lastSuccessfulUpdate: lastSuccessIso
        }
    };
}

function main() {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`[health-check] ${error.message}`);
        process.exit(1);
    }

    const now = new Date();
    const result = {
        checkedAt: now.toISOString(),
        maxAgeHours: options.maxAgeHours,
        healthFile: path.relative(PROJECT_ROOT, HEALTH_FILE),
        reportFile: path.relative(PROJECT_ROOT, REPORT_FILE),
        ok: false,
        errors: [],
        warnings: [],
        health: {}
    };

    try {
        const health = loadJson(HEALTH_FILE, 'health-status.json');
        const validation = validateHealth(health, now, options.maxAgeHours);
        result.errors.push(...validation.errors);
        result.warnings.push(...validation.warnings);
        result.health = validation.summary;
    } catch (error) {
        result.errors.push(error.message);
    }

    if (fs.existsSync(REPORT_FILE)) {
        try {
            const report = loadJson(REPORT_FILE, 'update-report.json');
            const reportTimestamp = toIso(report.timestamp);
            if (!reportTimestamp) {
                result.warnings.push('update-report timestamp is missing or invalid');
            }
        } catch (error) {
            result.warnings.push(`unable to parse update-report.json: ${error.message}`);
        }
    } else {
        result.warnings.push('update-report.json not found');
    }

    result.ok = result.errors.length === 0;

    if (options.jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        const level = result.ok ? 'PASS' : 'FAIL';
        console.log(`[health-check] ${level}`);
        console.log(
            `[health-check] status=${result.health.status || 'unknown'} source=${result.health.sourceStatus || 'unknown'} items=${result.health.itemCount == null ? 'unknown' : result.health.itemCount}`
        );
        console.log(
            `[health-check] lastSuccessfulUpdate=${result.health.lastSuccessfulUpdate || 'unknown'} (maxAgeHours=${result.maxAgeHours})`
        );
        if (result.warnings.length > 0) {
            result.warnings.forEach((warning) => {
                console.log(`[health-check] warning: ${warning}`);
            });
        }
        if (result.errors.length > 0) {
            result.errors.forEach((error) => {
                console.error(`[health-check] error: ${error}`);
            });
        }
    }

    process.exit(result.ok ? 0 : 1);
}

main();
