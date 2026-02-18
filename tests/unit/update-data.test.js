#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const {
    RoadmapDataUpdater,
    validateApiResponse,
    isRoadmapItem
} = require(path.join(__dirname, '..', '..', 'scripts', 'update-data.js'));

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

runTest('isRoadmapItem accepts required shape', () => {
    const item = {
        id: 1,
        title: 'Feature',
        description: 'Description',
        status: 'In development'
    };
    assert.strictEqual(isRoadmapItem(item), true);
});

runTest('isRoadmapItem rejects incomplete shape', () => {
    assert.strictEqual(isRoadmapItem({ id: 1, title: 'Missing fields' }), false);
    assert.strictEqual(isRoadmapItem(null), false);
});

runTest('validateApiResponse accepts valid array', () => {
    const payload = [
        { id: 1, title: 'A', description: 'A desc', status: 'In development' },
        { id: 2, title: 'B', description: 'B desc', status: 'Rolling out' }
    ];
    assert.strictEqual(validateApiResponse(payload), true);
});

runTest('validateApiResponse rejects invalid payloads', () => {
    assert.throws(() => validateApiResponse({}), /must be an array/);
    assert.throws(
        () => validateApiResponse([{ id: 1, title: 'A', description: 'No status' }]),
        /missing required fields/
    );
});

runTest('processData calculates statistics from normalized items', () => {
    const updater = new RoadmapDataUpdater();
    const items = [
        {
            id: 1,
            title: 'Feature A',
            description: 'desc',
            status: 'In development',
            publicDisclosureAvailabilityDate: '2026-01-15',
            tagsContainer: {
                products: [{ tagName: 'Teams' }],
                platforms: [{ tagName: 'Web' }]
            }
        },
        {
            id: 2,
            title: 'Feature B',
            description: 'desc',
            status: 'Rolling out',
            publicDisclosureAvailabilityDate: '2026-02-15',
            tagsContainer: {
                products: [{ tagName: 'Outlook' }],
                platforms: [{ tagName: 'Desktop' }]
            }
        }
    ];

    const processed = updater.processData(items);
    assert.strictEqual(processed.metadata.totalItems, 2);
    assert.strictEqual(processed.items.length, 2);
    assert.strictEqual(processed.statistics.totalItems, 2);
    assert.strictEqual(processed.statistics.byStatus['In development'], 1);
    assert.strictEqual(processed.statistics.byStatus['Rolling out'], 1);
    assert.strictEqual(processed.statistics.byProduct.Teams, 1);
    assert.strictEqual(processed.statistics.byPlatform.Web, 1);
});

if (process.exitCode) {
    process.exit(process.exitCode);
}
