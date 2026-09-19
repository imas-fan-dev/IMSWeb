#!/usr/bin/env node
// Compare only the *skipped* cases of two Vitest JSON reports for a fixed file
// list. The PostgreSQL-disabled path is the one run whose pass/skip split has to
// stay stable across a taxonomy change: the wrapper declares every case and the
// PG-backed ones report themselves skipped at run time, so a taxonomy edit must
// neither drop a declaration nor change which declaration is skipped.
//
// Usage:
//   node tools/a2-check-skips.mjs <before.json> <after.json> --files <list.txt>

import { readFileSync } from 'node:fs';
import path from 'node:path';

const [, , beforePath, afterPath, ...rest] = process.argv;

let fileListPath = null;
for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--files') {
        fileListPath = rest[index + 1];
        index += 1;
    }
}
if (!beforePath || !afterPath || !fileListPath) {
    console.error('usage: a2-check-skips.mjs <before.json> <after.json> --files <list.txt>');
    process.exit(2);
}

const workspaceRoot = process.cwd();
const relative = (absolute) => {
    const value = path.relative(workspaceRoot, absolute);
    return value.startsWith('..') ? absolute : value.split(path.sep).join('/');
};
const wanted = new Set(
    readFileSync(fileListPath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
);

function skipped(filePath) {
    const report = JSON.parse(readFileSync(filePath, 'utf8'));
    const map = new Map();
    for (const result of report.testResults) {
        const file = relative(result.name);
        if (!wanted.has(file)) continue;
        map.set(
            file,
            result.assertionResults
                .filter((assertion) => assertion.status === 'skipped')
                .map((assertion) => ({ fullName: assertion.fullName, title: assertion.title })),
        );
    }
    return map;
}

const before = skipped(beforePath);
const after = skipped(afterPath);

const failures = [];
let beforeTotal = 0;
let afterTotal = 0;
const rows = [];

for (const file of [...wanted].sort()) {
    const from = before.get(file) ?? [];
    const to = after.get(file) ?? [];
    beforeTotal += from.length;
    afterTotal += to.length;
    if (from.length !== to.length) {
        failures.push(`${file}: skipped ${from.length} -> ${to.length}`);
    }
    let restored = 0;
    for (let index = 0; index < Math.min(from.length, to.length); index += 1) {
        if (to[index].fullName === from[index].fullName) restored += 1;
        else if (!from[index].fullName.endsWith(to[index].title)) {
            failures.push(
                `${file}: ${JSON.stringify(to[index].title)} is not a literal tail of ${JSON.stringify(from[index].fullName)}`,
            );
        }
    }
    if (from.length > 0) rows.push(`${file}\tskipped=${from.length}->${to.length}\tunchanged-name=${restored}`);
}

console.log(rows.join('\n'));
console.log(`skipped cases: ${beforeTotal} -> ${afterTotal}`);
console.log(`failures: ${failures.length}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);
if (failures.length > 0) process.exit(1);
