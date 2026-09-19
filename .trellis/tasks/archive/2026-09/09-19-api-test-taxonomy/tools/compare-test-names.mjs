#!/usr/bin/env node
// Compare two Vitest JSON reports before and after a taxonomy change.
//
// The name set is compared two ways, because the runner concatenates the
// `describe` path with the case title and grouping therefore *adds* the path:
//
//   * `lossless` -- the post-change case title must be a literal suffix of the
//     pre-change full name. This is the strict "no case text was rewritten,
//     dropped, or reordered" check and must hold for 100% of cases.
//   * `byte-exact` -- the post-change full name equals the pre-change full
//     name, i.e. the `describe` path is exactly the phrase the case name led
//     with. Cases that fail it are grouped under a subject their name did not
//     literally repeat; the added words are reported per case.
//
// Files and cases must line up position by position, which also proves the
// change did not reorder or add declarations.
//
// Usage:
//   node tools/compare-test-names.mjs <before.json> <after.json> [--report <out.md>]

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [, , beforePath, afterPath, ...rest] = process.argv;

let reportPath = null;
let only = null;
for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--report') {
        reportPath = rest[index + 1];
        index += 1;
    } else if (rest[index] === '--only') {
        only = rest[index + 1];
        index += 1;
    }
}

const workspaceRoot = process.cwd();
const toRelative = (absolute) => {
    const relative = path.relative(workspaceRoot, absolute);
    return relative.startsWith('..') ? absolute : relative.split(path.sep).join('/');
};

function load(filePath) {
    const report = JSON.parse(readFileSync(filePath, 'utf8'));
    const files = [];
    for (const testResult of report.testResults) {
        files.push({
            file: toRelative(testResult.name),
            assertions: testResult.assertionResults.map((assertion) => ({
                fullName: assertion.fullName,
                title: assertion.title,
                ancestors: assertion.ancestorTitles,
                status: assertion.status,
            })),
        });
    }
    return files;
}

const before = load(beforePath).filter((entry) => only === null || entry.file.startsWith(only));
const after = load(afterPath).filter((entry) => only === null || entry.file.startsWith(only));

const beforeByFile = new Map(before.map((entry) => [entry.file, entry]));
const afterByFile = new Map(after.map((entry) => [entry.file, entry]));

const lines = [];
const summary = {
    filesBefore: before.length,
    filesAfter: after.length,
    casesBefore: before.reduce((total, entry) => total + entry.assertions.length, 0),
    casesAfter: after.reduce((total, entry) => total + entry.assertions.length, 0),
    byteExact: 0,
    pathAdded: 0,
    losslessFailures: [],
    addedFiles: [],
    removedFiles: [],
    perFile: [],
};

for (const entry of before) {
    if (!afterByFile.has(entry.file)) summary.removedFiles.push(entry.file);
}
for (const entry of after) {
    if (!beforeByFile.has(entry.file)) summary.addedFiles.push(entry.file);
}

for (const entry of before) {
    const counterpart = afterByFile.get(entry.file);
    if (!counterpart) continue;

    const record = { file: entry.file, cases: entry.assertions.length, byteExact: 0, pathAdded: [], deltas: [] };

    if (counterpart.assertions.length !== entry.assertions.length) {
        summary.losslessFailures.push(
            `${entry.file}: case count ${entry.assertions.length} -> ${counterpart.assertions.length}`,
        );
    }

    const length = Math.min(entry.assertions.length, counterpart.assertions.length);
    for (let index = 0; index < length; index += 1) {
        const from = entry.assertions[index];
        const to = counterpart.assertions[index];

        // Byte-exact first: the describe path reproduced the phrase the case
        // name already led with, so the runner's concatenation is unchanged
        // even though the case title itself got shorter.
        if (to.fullName === from.fullName) {
            record.byteExact += 1;
            summary.byteExact += 1;
            continue;
        }

        if (!from.fullName.endsWith(to.title)) {
            summary.losslessFailures.push(
                `${entry.file}: ${JSON.stringify(to.title)} is not a literal suffix of ${JSON.stringify(from.fullName)}`,
            );
            continue;
        }

        const path_ = to.fullName.slice(0, to.fullName.length - to.title.length);
        const absorbed = from.fullName.slice(0, from.fullName.length - to.title.length);
        record.pathAdded.push({
            from: from.fullName,
            to: to.fullName,
            path: path_.trimEnd(),
            match: from.fullName.startsWith(path_),
        });
        record.deltas.push(`${JSON.stringify(absorbed)} -> ${JSON.stringify(path_.trimEnd())}`);
        summary.pathAdded += 1;
    }

    summary.perFile.push(record);
    lines.push(
        `${entry.file}\tcases=${record.cases}\tbyteExact=${record.byteExact}\tpathAdded=${record.pathAdded.length}`,
    );
}

const losses = summary.losslessFailures;
const addedFiles = summary.perFile.filter((record) => record.pathAdded.length > 0);

const markdown = [];
markdown.push('# Name-set comparison');
markdown.push('');
markdown.push(`- before: \`${beforePath}\` (${summary.filesBefore} files / ${summary.casesBefore} cases)`);
markdown.push(`- after:  \`${afterPath}\` (${summary.filesAfter} files / ${summary.casesAfter} cases)`);
markdown.push('');
markdown.push('## Counts');
markdown.push('');
markdown.push(`- files unchanged: ${summary.filesBefore === summary.filesAfter && summary.addedFiles.length === 0 && summary.removedFiles.length === 0}`);
markdown.push(`- cases unchanged: ${summary.casesBefore === summary.casesAfter}`);
markdown.push(`- full-name byte-exact: ${summary.byteExact} / ${summary.casesBefore}`);
markdown.push(`- full-name changed only by an added describe path: ${summary.pathAdded} / ${summary.casesBefore}`);
markdown.push(`- case-title lossless (post title is a literal tail of the pre name): ${losses.length === 0}`);
markdown.push('');
if (summary.addedFiles.length > 0) markdown.push(`- added files: ${summary.addedFiles.join(', ')}`);
if (summary.removedFiles.length > 0) markdown.push(`- removed files: ${summary.removedFiles.join(', ')}`);
markdown.push('');
markdown.push('## Per file');
markdown.push('');
markdown.push('| file | cases | byte-exact | path added |');
markdown.push('| --- | --- | --- | --- |');
for (const record of summary.perFile) {
    markdown.push(`| ${record.file} | ${record.cases} | ${record.byteExact} | ${record.pathAdded.length} |`);
}
markdown.push('');
markdown.push('## Cases whose name did not literally begin with the new describe path');
markdown.push('');
markdown.push('For each, the describe path that was added in front of the verbatim case title.');
markdown.push('');
for (const record of addedFiles) {
    markdown.push(`### ${record.file}`);
    markdown.push('');
    for (const entry of record.pathAdded) {
        markdown.push(`- added: ${entry.match ? '(literal prefix)' : `\`${entry.path}\``}`);
        markdown.push(`  - before: \`${entry.from}\``);
        markdown.push(`  - after:  \`${entry.to}\``);
    }
    markdown.push('');
}
markdown.push('## Lossless failures');
markdown.push('');
markdown.push(losses.length === 0 ? 'none' : losses.map((line) => `- ${line}`).join('\n'));
markdown.push('');

if (reportPath) writeFileSync(reportPath, markdown.join('\n'));

console.log(lines.join('\n'));
console.log('');
console.log(
    `files ${summary.filesBefore} -> ${summary.filesAfter}; cases ${summary.casesBefore} -> ${summary.casesAfter}; ` +
        `byte-exact ${summary.byteExact}; path-added ${summary.pathAdded}; lossless failures ${losses.length}`,
);
if (losses.length > 0) {
    for (const line of losses) console.error(`LOSS: ${line}`);
    process.exit(1);
}
