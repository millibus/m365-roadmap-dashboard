#!/usr/bin/env node

/**
 * M365 Roadmap Data Validation Script
 *
 * Validates shape and required fields of roadmap JSON files (roadmap-data.json,
 * roadmap-data-compact.json, sample-data.json). Used by npm run validate and
 * can be run standalone for CI or local checks.
 *
 * Usage:
 *   node scripts/validate-data.js [path-to-data-dir]
 *
 * Default data directory: ./data (relative to project root)
 * Exit: 0 if all valid, 1 if any validation fails.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, 'data');

const REQUIRED_TOP_LEVEL_KEYS = ['metadata', 'items'];
const REQUIRED_METADATA_KEYS = ['lastUpdated', 'totalItems', 'apiSource', 'version'];
const REQUIRED_ITEM_KEYS = ['id', 'title', 'description', 'status'];

function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length >= 0;
}

function validateMetadata(metadata, source) {
    const errors = [];
    if (!metadata || typeof metadata !== 'object') {
        return [`${source}: metadata must be an object`];
    }
    for (const key of REQUIRED_METADATA_KEYS) {
        if (!(key in metadata)) {
            errors.push(`${source}: metadata missing "${key}"`);
        }
    }
    if (metadata.totalItems != null && typeof metadata.totalItems !== 'number') {
        errors.push(`${source}: metadata.totalItems must be a number`);
    }
    return errors;
}

function validateItem(item, index, source) {
    const errors = [];
    if (!item || typeof item !== 'object') {
        errors.push(`${source}: items[${index}] must be an object`);
        return errors;
    }
    for (const key of REQUIRED_ITEM_KEYS) {
        if (!(key in item)) {
            errors.push(`${source}: items[${index}] missing "${key}"`);
        }
    }
    return errors;
}

/**
 * Validates payload shape: { metadata, items[, statistics] } with items array
 * of objects that have id, title, description, status.
 */
function validateRoadmapPayload(data, source) {
    const errors = [];
    if (!data || typeof data !== 'object') {
        errors.push(`${source}: root must be an object`);
        return errors;
    }
    for (const key of REQUIRED_TOP_LEVEL_KEYS) {
        if (!(key in data)) {
            errors.push(`${source}: missing "${key}"`);
        }
    }
    if (!isNonEmptyArray(data.items)) {
        errors.push(`${source}: "items" must be an array`);
    } else {
        errors.push(...validateMetadata(data.metadata, source));
        const expectedTotal = data.metadata?.totalItems;
        if (typeof expectedTotal === 'number' && data.items.length !== expectedTotal) {
            errors.push(
                `${source}: metadata.totalItems (${expectedTotal}) does not match items.length (${data.items.length})`
            );
        }
        data.items.forEach((item, i) => {
            errors.push(...validateItem(item, i, source));
        });
    }
    return errors;
}

function loadAndValidateFile(filePath, sourceLabel) {
    const errors = [];
    let data;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        data = JSON.parse(raw);
    } catch (e) {
        errors.push(`${sourceLabel}: ${e.message}`);
        return errors;
    }
    errors.push(...validateRoadmapPayload(data, sourceLabel));
    return errors;
}

function main() {
    const dataDir = process.argv[2] || DEFAULT_DATA_DIR;
    const allErrors = [];
    const files = [
        { file: 'roadmap-data.json', label: 'roadmap-data.json', required: true },
        { file: 'roadmap-data-compact.json', label: 'roadmap-data-compact.json', required: false },
        { file: 'sample-data.json', label: 'sample-data.json', required: false }
    ];

    let validatedCount = 0;
    for (const { file, label, required } of files) {
        const fullPath = path.join(dataDir, file);
        if (!fs.existsSync(fullPath)) {
            if (required) {
                allErrors.push(`${label}: required file not found at ${fullPath}`);
            }
            continue;
        }
        const fileErrors = loadAndValidateFile(fullPath, label);
        if (fileErrors.length > 0) {
            allErrors.push(...fileErrors);
        } else {
            validatedCount++;
        }
    }

    if (validatedCount === 0 && allErrors.length === 0) {
        allErrors.push('No data files found in ' + dataDir + '. Run npm run update-data or add sample-data.json.');
    }

    if (allErrors.length > 0) {
        console.error('[validate-data] Validation failed:\n');
        allErrors.forEach((e) => console.error('  -', e));
        process.exit(1);
    }
    console.log('[validate-data] All data files passed validation.');
    process.exit(0);
}

main();
