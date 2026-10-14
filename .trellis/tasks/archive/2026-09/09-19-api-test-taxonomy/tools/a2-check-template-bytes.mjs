#!/usr/bin/env node
// Prove that a taxonomy change did not touch the bytes of a multi-line template
// literal's interior. `diff-content-shape.mjs` trims every line, so an
// indentation-only change inside a SQL/JSON template would slip through it; the
// scanner can point at the continuation lines, and their multisets must match
// HEAD exactly.
//
// Usage:
//   node tools/a2-check-template-bytes.mjs <file> [<file> ...]

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { scan } from './scan-test-structure.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
    console.error('usage: a2-check-template-bytes.mjs <file> [<file> ...]');
    process.exit(2);
}

const multiset = (lines) => {
    const map = new Map();
    for (const line of lines) map.set(line, (map.get(line) ?? 0) + 1);
    return map;
};

let comparedLines = 0;
let comparedFiles = 0;
const failures = [];

for (const file of files) {
    const before = execSync(`git show HEAD:${file}`, { encoding: 'utf8' });
    const after = readFileSync(file, 'utf8');
    const collect = (text) => {
        const { lines, templateLines } = scan(text);
        return [...templateLines].sort((left, right) => left - right).map((index) => lines[index]);
    };
    const from = collect(before);
    const to = collect(after);
    if (from.length === 0) continue;
    comparedFiles += 1;
    comparedLines += from.length;
    const left = multiset(from);
    const right = multiset(to);
    for (const [line, count] of right) {
        if ((left.get(line) ?? 0) < count) failures.push(`${file}: introduced template byte line ${JSON.stringify(line)}`);
    }
    for (const [line, count] of left) {
        if ((right.get(line) ?? 0) < count) failures.push(`${file}: lost template byte line ${JSON.stringify(line)}`);
    }
}

console.log(`files with multi-line templates: ${comparedFiles}`);
console.log(`template-interior lines compared: ${comparedLines}`);
console.log(`failures: ${failures.length}`);
for (const failure of failures) console.log(`  ${failure}`);
if (failures.length > 0) process.exit(1);
