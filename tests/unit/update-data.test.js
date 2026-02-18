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

runTest('detectChanges marks new items', () => {
    const updater = new RoadmapDataUpdater();
    // Point outputDir to a non-existent path so no previous data is found
    updater.outputDir = path.join(__dirname, '__nonexistent__');
    const items = [
        { id: 1, title: 'A', description: 'desc', status: 'In development' }
    ];
    updater.detectChanges(items);
    // No previous file → all unchanged (no false positives)
    assert.strictEqual(items[0]._changeType, 'unchanged');
    assert.deepStrictEqual(items[0]._changedFields, []);
});

runTest('detectChanges detects new and changed items against previous snapshot', () => {
    const fs = require('fs');
    const os = require('os');
    const updater = new RoadmapDataUpdater();

    // Create a temp dir with a previous snapshot
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-changes-'));
    updater.outputDir = tmpDir;

    const prevData = {
        metadata: { lastUpdated: '2026-01-01', totalItems: 2 },
        items: [
            { id: 1, title: 'Old Title', description: 'desc', status: 'In development', tagsContainer: {} },
            { id: 2, title: 'Existing', description: 'desc', status: 'Rolling out', tagsContainer: {} }
        ]
    };
    fs.writeFileSync(path.join(tmpDir, 'roadmap-data.json'), JSON.stringify(prevData));

    const newItems = [
        { id: 1, title: 'New Title', description: 'desc', status: 'In development', tagsContainer: {} },
        { id: 2, title: 'Existing', description: 'desc', status: 'Rolling out', tagsContainer: {} },
        { id: 3, title: 'Brand New', description: 'desc', status: 'Launched', tagsContainer: {} }
    ];

    updater.detectChanges(newItems);

    // Item 1: title changed
    assert.strictEqual(newItems[0]._changeType, 'changed');
    assert.ok(newItems[0]._changedFields.includes('title'));

    // Item 2: unchanged
    assert.strictEqual(newItems[1]._changeType, 'unchanged');
    assert.deepStrictEqual(newItems[1]._changedFields, []);

    // Item 3: new
    assert.strictEqual(newItems[2]._changeType, 'new');
    assert.deepStrictEqual(newItems[2]._changedFields, []);

    // Cleanup
    fs.unlinkSync(path.join(tmpDir, 'roadmap-data.json'));
    fs.rmdirSync(tmpDir);
});

if (process.exitCode) {
    process.exit(process.exitCode);
}
