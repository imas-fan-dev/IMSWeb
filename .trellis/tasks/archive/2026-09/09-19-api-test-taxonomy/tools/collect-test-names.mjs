#!/usr/bin/env node
// Collect the full test-name set from a Vitest `--reporter=json` report.
//
// Ground truth is the runner's own JSON (Jest-shaped), not a hand-written
// source parser: every assertion carries `ancestorTitles` (outer->inner
// `describe` titles) and `fullName` (those titles plus the case title, joined
// with a single space). A taxonomy change must leave that set byte-identical,
// so the output is a sorted, per-file multiset -- duplicates are preserved and
// file order from the runner's parallel workers cannot make the diff flaky.
//
// Usage:
//   node tools/collect-test-names.mjs <report.json> [--names <out.txt>]
//
// Writes `<out.txt>` (names) and prints a per-file and per-status summary.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [, , reportPath, ...rest] = process.argv;

if (!reportPath) {
    console.error('usage: collect-test-names.mjs <report.json> [--names <out.txt>]');
    process.exit(2);
}

let namesPath = null;

for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--names') {
        namesPath = rest[index + 1];
        index += 1;
    } else {
        console.error(`unknown argument: ${rest[index]}`);
        process.exit(2);
    }
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));

// The report's `name` is the absolute path of the test file. Keying on a path
// relative to the workspace keeps the evidence portable between the worktree
// and the main checkout.
const workspaceRoot = path.resolve(process.cwd());

function toRelative(absolute) {
    const relative = path.relative(workspaceRoot, absolute);
    return relative.startsWith('..') ? absolute : relative.split(path.sep).join('/');
}

function assertAncestorTitlesMatchFullName(assertion, where) {
    const expected = [...assertion.ancestorTitles, assertion.title].join(' ');
    if (expected !== assertion.fullName) {
        throw new Error(
            `ancestorTitles + title does not reproduce fullName at ${where}: ` +
                `${JSON.stringify(expected)} !== ${JSON.stringify(assertion.fullName)}`,
        );
    }
}

const names = [];
const statusCounts = new Map();
const perFile = [];
let totalAssertions = 0;

for (const testResult of report.testResults) {
    const file = toRelative(testResult.name);
    const titles = [];

    for (const assertion of testResult.assertionResults) {
        assertAncestorTitlesMatchFullName(assertion, file);
        titles.push(assertion.fullName);
        statusCounts.set(assertion.status, (statusCounts.get(assertion.status) ?? 0) + 1);
        totalAssertions += 1;
    }

    titles.sort();
    for (let index = 0; index < titles.length; index += 1) {
        names.push(`${file}\t${titles[index]}`);
    }

    perFile.push({ file, count: titles.length });
}

const suiteStatusCounts = new Map();
for (const testResult of report.testResults) {
    const status = testResult.status ?? 'unknown';
    suiteStatusCounts.set(status, (suiteStatusCounts.get(status) ?? 0) + 1);
}

names.sort();

if (namesPath) {
    writeFileSync(namesPath, `${names.join('\n')}\n`);
}

console.log(`report:            ${path.resolve(reportPath)}`);
console.log(`test files:        ${report.testResults.length} (json numTotalTestSuites=${report.numTotalTestSuites})`);
console.log(`assertions:        ${totalAssertions} (json numTotalTests=${report.numTotalTests})`);
console.log(`json passed/failed/pending/todo: ${report.numPassedTests}/${report.numFailedTests}/${report.numPendingTests}/${report.numTodoTests}`);
console.log(`json success:      ${report.success}`);
console.log(
    `suite status:      ${[...suiteStatusCounts.entries()].map(([key, value]) => `${key}=${value}`).join(' ')}`,
);
console.log(
    `assertion status:  ${[...statusCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')}`,
);
console.log(`unique names:      ${new Set(names).size} (lines=${names.length})`);

const longest = perFile.reduce((max, entry) => Math.max(max, entry.file.length), 0);
for (const entry of [...perFile].sort((left, right) => left.file.localeCompare(right.file))) {
    console.log(`  ${entry.file.padEnd(longest)}  ${String(entry.count).padStart(4)}`);
}

if (namesPath) {
    console.log(`names written to:  ${path.resolve(namesPath)}`);
}
