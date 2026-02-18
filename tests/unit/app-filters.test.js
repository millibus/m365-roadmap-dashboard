#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const { filterRoadmapItems } = require(path.join(__dirname, '..', '..', 'js', 'app.js'));

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

const fixtures = [
    {
        id: 1,
        title: 'Teams Copilot summary',
        description: 'Summarize meetings faster',
        status: 'In development',
        tagsContainer: {
            products: [{ tagName: 'Teams' }],
            platforms: [{ tagName: 'Web' }]
        },
        publicDisclosureAvailabilityDate: '2026-03-15'
    },
    {
        id: 2,
        title: 'Outlook drafting',
        description: 'Draft with AI',
        status: 'Rolling out',
        tagsContainer: {
            products: [{ tagName: 'Outlook' }],
            platforms: [{ tagName: 'Desktop' }]
        },
        publicDisclosureAvailabilityDate: '2026-05-20'
    },
    {
        id: 3,
        title: 'Invalid tags object still valid item',
        description: 'No tags should not crash filters',
        status: 'In development'
    }
];

runTest('search filter matches title and description case-insensitively', () => {
    const result = filterRoadmapItems(fixtures, { search: 'summary' });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 1);

    const descResult = filterRoadmapItems(fixtures, { search: 'draft with ai' });
    assert.strictEqual(descResult.length, 1);
    assert.strictEqual(descResult[0].id, 2);
});

runTest('service/status/platform filters apply together', () => {
    const result = filterRoadmapItems(fixtures, {
        service: 'Teams',
        status: 'In development',
        platform: 'Web'
    });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 1);
});

runTest('malformed items are ignored without throwing', () => {
    const mixed = [...fixtures, null, undefined, 'not-an-object'];
    const result = filterRoadmapItems(mixed, { status: 'In development' });
    assert.strictEqual(result.length, 2);
});

runTest('timeline filter delegates to supplied matcher', () => {
    let calls = 0;
    const result = filterRoadmapItems(
        fixtures,
        { timeline: 'this-quarter' },
        (item, timeline) => {
            calls += 1;
            return item.id === 2 && timeline === 'this-quarter';
        }
    );

    assert.strictEqual(calls, fixtures.length);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 2);
});

if (process.exitCode) {
    process.exit(process.exitCode);
}
