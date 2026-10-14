#!/usr/bin/env node
// Merge several Vitest JSON reports into one, keeping the first occurrence of
// each test file. The A2 slice needed a "before" baseline that spans two
// gatherings: the 25 files of the slice (collected together) plus
// about-page-content.test.ts, whose pre-change state is only present in the A1
// server report because the batch's own `before` run did not include it.
//
// Usage:
//   node tools/a2-merge-reports.mjs <out.json> <in.json> [<in.json> ...]

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [, , outPath, ...rest] = process.argv;
let only = null;
const inputs = [];
for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--files') {
        only = new Set(
            readFileSync(rest[index + 1], 'utf8')
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0),
        );
        index += 1;
    } else {
        inputs.push(rest[index]);
    }
}
if (!outPath || rest.length < 1) {
    console.error('usage: a2-merge-reports.mjs <out.json> [--files <list.txt>] <in.json> [<in.json> ...]');
    process.exit(2);
}

const workspaceRoot = process.cwd();
const relative = (absolute) => {
    const value = path.relative(workspaceRoot, absolute);
    return value.startsWith('..') ? absolute : value.split(path.sep).join('/');
};

const seen = new Set();
const testResults = [];
let numTotalTests = 0;
let numPassedTests = 0;
let numFailedTests = 0;
let numPendingTests = 0;
let numTodoTests = 0;

for (const input of inputs) {
    const report = JSON.parse(readFileSync(input, 'utf8'));
    for (const result of report.testResults) {
        if (seen.has(result.name)) continue;
        if (only && !only.has(relative(result.name))) continue;
        seen.add(result.name);
        testResults.push(result);
        numTotalTests += result.assertionResults.length;
        for (const assertion of result.assertionResults) {
            if (assertion.status === 'passed') numPassedTests += 1;
            else if (assertion.status === 'failed') numFailedTests += 1;
            else numPendingTests += 1;
        }
    }
}

writeFileSync(
    outPath,
    JSON.stringify({
        numTotalTestSuites: testResults.length,
        numTotalTests,
        numPassedTests,
        numFailedTests,
        numPendingTests,
        numTodoTests,
        success: numFailedTests === 0,
        testResults,
    }),
);

console.log(`${outPath}: ${testResults.length} files / ${numTotalTests} cases`);
