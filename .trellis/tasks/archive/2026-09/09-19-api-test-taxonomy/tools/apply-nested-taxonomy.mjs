#!/usr/bin/env node
// Apply a *two-level* taxonomy plan to test files.
//
// `tools/apply-taxonomy.mjs` (batch A1) handles the single-level case: one
// trailing `describe` around every case. Batches B/C/D need two extra shapes
// that tool cannot express:
//
//   * a second level -- a contiguous run of cases nested inside the subject
//     suite (`admin-data`, `postgres-migrations`, `operation-scripts`, ...);
//   * a subject suite whose range contains a helper declaration that sits
//     between two cases (`tests/migration/postgres-migrations.test.js`).
//
// A plan entry names the file, the subject suite (optional) and the second
// level groups. Case indices are *test ordinals*: 0 is the first `test(...)`
// declaration in the file, 1 the second, and so on -- the same order the
// runner reports (`assertionResults`), so the plan can be written straight from
// `--reporter=json` names.
//
// The rewriter only ever does three things, mechanically:
//
//   1. inserts the suite open/close lines around a contiguous line range;
//   2. indents every line of a wrapped range by one level per enclosing suite,
//      except lines inside a multi-line template literal, whose leading
//      whitespace is part of the string value;
//   3. shortens a case title by a literal leading subject phrase and then a
//      literal leading category phrase. A title that does not begin with the
//      phrase is kept verbatim.
//
// Nothing else moves: no assertion, body, fixture or import is touched, and
// case order is preserved.
//
// Usage:
//   node tools/apply-nested-taxonomy.mjs <plan.json> [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { classify, scan } from './scan-test-structure.mjs';

const INDENT = '    ';

// Second plan shape, for a file whose cases already sit inside a hand-written
// `describe(...)`: the scanner sees that suite as one statement, so the nested
// groups are named by line range instead of by test ordinal. Each range starts
// on a case declaration and ends on its closing `});` line (1-based, inclusive).
// A case declaration is `test(` or the `postgresTest(` wrapper, the same two
// shapes the non-JSON boundary analyser counts as a focused case.
function rewriteInsideSuite(entry, workspaceRoot, dryRun) {
    const absolute = resolve(workspaceRoot, entry.path);
    const text = readFileSync(absolute, 'utf8');
    const { lines, templateLines } = scan(text);
    const bodyIndent = entry.suiteBodyIndent ?? 1;
    const opens = new Map();
    const closes = new Map();
    const indentLevels = new Array(lines.length).fill(0);
    const trims = [];

    for (const category of entry.categories) {
        const [fromLine, toLine] = category.lines;
        const first = fromLine - 1;
        const last = toLine - 1;
        if (!/^\s*(?:test|postgresTest)\(/.test(lines[first])) {
            throw new Error(`${entry.path}: line ${fromLine} is not a case declaration`);
        }
        if (!/^\s*\}\);\s*$/.test(lines[last])) {
            throw new Error(`${entry.path}: line ${toLine} is not a closing brace`);
        }
        for (let position = first; position <= last; position += 1) indentLevels[position] += 1;

        const open = `${INDENT.repeat(bodyIndent)}test.describe('${category.title.replace(/'/g, "\\'")}', () => {`;
        const close = `${INDENT.repeat(bodyIndent)}});`;
        if (!opens.has(first)) opens.set(first, []);
        opens.get(first).push(open);
        if (!closes.has(last)) closes.set(last, []);
        closes.get(last).push(close);

        for (let position = first; position <= last; position += 1) {
            const match = /(?:test|postgresTest)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/.exec(lines[position]);
            if (!match) continue;
            const quote = match[1] !== undefined ? "'" : '"';
            const original = match[1] ?? match[2];
            if (!original.startsWith(`${category.title} `)) continue;
            const title = original.slice(category.title.length + 1);
            trims.push({ line: position, from: `${original}${quote}`, to: `${title}${quote}`, original, title });
        }
    }

    const out = [];
    for (let position = 0; position < lines.length; position += 1) {
        for (const open of opens.get(position) ?? []) {
            if (out.length > 0 && out[out.length - 1].trim().length > 0) out.push('');
            out.push(open);
        }
        let line = lines[position];
        if (indentLevels[position] > 0 && line.trim().length > 0 && !templateLines.has(position)) {
            line = INDENT.repeat(indentLevels[position]) + line;
        }
        for (const trim of trims) {
            if (trim.line === position) line = line.replace(trim.from, trim.to);
        }
        out.push(line);
        for (const close of closes.get(position) ?? []) out.push(close);
    }

    if (!dryRun) writeFileSync(absolute, out.join('\n'));
    return { path: entry.path, tests: 0, subjects: 0, categories: entry.categories.length, trims };
}

function rewrite(entry, workspaceRoot, dryRun) {
    if (entry.categories && entry.categories.every((category) => Array.isArray(category.lines))) {
        return rewriteInsideSuite(entry, workspaceRoot, dryRun);
    }
    const absolute = resolve(workspaceRoot, entry.path);
    const text = readFileSync(absolute, 'utf8');
    const { lines, statements, templateLines } = scan(text);

    const tests = statements
        .map((statement, position) => ({ statement, position }))
        .filter(({ statement }) => classify(statement.head).kind === 'test');

    const topDepth = entry.baseDepth ?? 0;
    const groups = [];

    if (entry.subject) {
        const ordinals = tests.map((_, index) => index);
        if (ordinals.join(',') !== entry.cases.join(',')) {
            throw new Error(
                `${entry.path}: subject cases ${entry.cases.join(',')} must be every test statement (${ordinals.join(',')})`,
            );
        }
        groups.push({
            title: entry.subject,
            wrapper: entry.wrapper ?? 'test.describe',
            from: tests[0].statement.startLine,
            to: tests[tests.length - 1].statement.endLine,
            depth: topDepth,
        });
    }

    const categoryOf = new Map();

    for (const category of entry.categories ?? []) {
        for (let index = 1; index < category.cases.length; index += 1) {
            if (category.cases[index] !== category.cases[index - 1] + 1) {
                throw new Error(`${entry.path}: category ${JSON.stringify(category.title)} is not a contiguous run`);
            }
        }
        const members = category.cases.map((ordinal) => {
            const member = tests[ordinal];
            if (!member) throw new Error(`${entry.path}: no test statement at ordinal ${ordinal}`);
            return member;
        });

        const first = members[0];
        const last = members[members.length - 1];
        for (let position = first.position; position <= last.position; position += 1) {
            if (classify(statements[position].head).kind !== 'test') {
                throw new Error(
                    `${entry.path}: a non-test statement sits inside the ${JSON.stringify(category.title)} run`,
                );
            }
        }

        for (const ordinal of category.cases) {
            if (categoryOf.has(ordinal)) throw new Error(`${entry.path}: test ${ordinal} is in two categories`);
            categoryOf.set(ordinal, category.title);
        }

        groups.push({
            title: category.title,
            wrapper: 'test.describe',
            from: first.statement.startLine,
            to: last.statement.endLine,
            depth: topDepth + (entry.subject ? 1 : 0),
        });
    }

    const indentLevels = new Array(lines.length).fill(0);
    for (const group of groups) {
        for (let position = group.from; position <= group.to; position += 1) indentLevels[position] += 1;
    }

    // Which line replaced which title, and with what.
    const trims = [];
    for (let ordinal = 0; ordinal < tests.length; ordinal += 1) {
        const { statement } = tests[ordinal];
        const original = classify(statement.head).staticName;
        if (original === null) continue;

        let title = original;
        if (entry.subject && title.startsWith(`${entry.subject} `)) title = title.slice(entry.subject.length + 1);
        const category = categoryOf.get(ordinal);
        if (category && title.startsWith(`${category} `)) title = title.slice(category.length + 1);
        if (title === original) continue;

        let line = -1;
        let quote = "'";
        for (let position = statement.startLine; position <= statement.endLine; position += 1) {
            const at = lines[position].indexOf(original);
            if (at < 0) continue;
            line = position;
            quote = lines[position][at + original.length] === '"' ? '"' : "'";
            break;
        }
        if (line < 0) {
            throw new Error(`${entry.path}: could not find ${JSON.stringify(original)} inside its declaration`);
        }
        trims.push({ line, from: `${original}${quote}`, to: `${title}${quote}`, original, title });
    }

    const opens = new Map();
    const closes = new Map();
    for (const group of groups) {
        const open = `${INDENT.repeat(group.depth)}${group.wrapper}('${group.title.replace(/'/g, "\\'")}', () => {`;
        const close = `${INDENT.repeat(group.depth)}});`;
        // A blank line separates the outermost suite from the fixture block
        // above it, mirroring `apply-taxonomy.mjs`. Nested runs sit directly
        // under the line they follow, so they add no blank line of their own.
        const outer = entry.subject !== null && group.depth === topDepth;
        if (!opens.has(group.from)) opens.set(group.from, []);
        opens.get(group.from).push({ outer, open });
        if (!closes.has(group.to)) closes.set(group.to, []);
        closes.get(group.to).push(close);
    }
    // An inner suite closes before its parent, so emit closes deepest first.
    for (const list of closes.values()) list.sort((left, right) => right.length - left.length);

    const out = [];
    for (let position = 0; position < lines.length; position += 1) {
        for (const { outer, open } of opens.get(position) ?? []) {
            // The blank line keeps the suite apart from the fixture block above
            // it without splitting a comment from the declaration it documents.
            const previous = out[out.length - 1];
            const previousIsComment = previous !== undefined && /^\s*(\/\/|\*|\/\*)/.test(previous);
            if (outer && previous !== undefined && previous.trim().length > 0 && !previousIsComment) out.push('');
            out.push(open);
        }

        let line = lines[position];
        const levels = indentLevels[position];
        if (levels > 0 && line.trim().length > 0 && !templateLines.has(position)) {
            line = INDENT.repeat(levels) + line;
        }
        for (const trim of trims) {
            if (trim.line === position) line = line.replace(trim.from, trim.to);
        }
        out.push(line);

        for (const close of closes.get(position) ?? []) out.push(close);
    }

    const result = out.join('\n');
    if (!dryRun) writeFileSync(absolute, result);

    return { path: entry.path, tests: tests.length, subjects: entry.subject ? 1 : 0, categories: (entry.categories ?? []).length, trims };
}

const [, , planPath, ...flags] = process.argv;
if (!planPath) {
    console.error('usage: apply-nested-taxonomy.mjs <plan.json> [--dry-run]');
    process.exit(2);
}

const workspaceRoot = process.cwd();
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

for (const entry of plan.files) {
    const report = rewrite(entry, workspaceRoot, flags.includes('--dry-run'));
    console.log(
        `${report.path.padEnd(58)} tests=${String(report.tests).padStart(3)} subject=${report.subjects} categories=${report.categories} trimmed=${String(report.trims.length).padStart(3)}`,
    );
    for (const trim of report.trims) {
        console.log(`      - ${JSON.stringify(trim.original)}\n        ${JSON.stringify(trim.title)}`);
    }
}
