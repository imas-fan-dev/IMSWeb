#!/usr/bin/env node
// Turn `scan-second-level.mjs` candidates into an `apply-nested-taxonomy.mjs`
// plan.
//
// The scan reports where a run of cases starts; the applier needs the line
// range to wrap, which ends on the *last* case's closing `});`. That line is
// derived here, at the run's own indentation, so the plan is generated rather
// than hand-counted.
//
// Usage:
//   node tools/plan-second-level.mjs <scan.json> <out.json> \
//       --pick 'apps/api/tests/server/events.test.ts::cursor event pagination' \
//       --indent 2

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INDENT = '    ';

function indentWidth(line) {
    return /^(\s*)/.exec(line)[1].replace(/\t/g, '    ').length;
}

function closingLine(lines, from) {
    const width = indentWidth(lines[from - 1]);
    for (let index = from; index < lines.length; index += 1) {
        if (indentWidth(lines[index]) !== width) continue;
        if (/^\s*\}\);\s*$/.test(lines[index])) return index + 1;
    }
    throw new Error(`no closing brace after line ${from}`);
}

const [scanArg, outArg, ...rest] = process.argv.slice(2);
if (!scanArg || !outArg) {
    console.error('usage: plan-second-level.mjs <scan.json> <out.json> --pick <path::phrase>… [--indent <n>]');
    process.exit(2);
}
const indentIndex = rest.indexOf('--indent');
const bodyIndent = indentIndex >= 0 ? Number(rest[indentIndex + 1]) : 1;
const picks = new Set();
for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--pick' && rest[index + 1]) picks.add(rest[index + 1]);
}

const report = JSON.parse(readFileSync(scanArg, 'utf8'));
const files = [];
for (const file of report) {
    const categories = [];
    for (const run of file.runs) {
        if (picks.size && !picks.has(`${file.path}::${run.phrase}`)) continue;
        const lines = readFileSync(file.path, 'utf8').split('\n');
        categories.push({
            title: run.phrase,
            lines: [run.fromLine, closingLine(lines, run.toLine)],
        });
    }
    if (categories.length) {
        files.push({ path: file.path, suiteBodyIndent: bodyIndent, categories });
    }
}

writeFileSync(outArg, `${JSON.stringify({ batch: 'A1-rescan', files }, null, 2)}\n`);
for (const file of files) {
    for (const category of file.categories) {
        console.log(`${file.path} L${category.lines[0]}-${category.lines[1]}  "${category.title}"`);
    }
}
console.log(`${INDENT}${files.length} 文件 / ${files.reduce((sum, file) => sum + file.categories.length, 0)} 段 → ${outArg}`);
