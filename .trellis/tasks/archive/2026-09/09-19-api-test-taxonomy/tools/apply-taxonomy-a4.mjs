#!/usr/bin/env node
// Apply the batch-A4 two-level taxonomy plan to test files.
//
// Batch A4 is the last slice of `tests/server` and needs three shapes the A1
// tool cannot express:
//
//   * a top-level suite whose range starts on a `for` loop that registers
//     template-titled cases (`upload-contract`), not on a `test(...)` line;
//   * files where the test function is aliased (`test as nodeTest`,
//     `postgresTest as test`), so the wrapper is the named `describe` import
//     and either an existing `vitest` import is extended or a new line added;
//   * a helper declaration sitting inside the wrapped range
//     (`platform-session-security.contract`, `platform-profile.contract`).
//
// Ranges and categories are named by 1-based inclusive line numbers, so the
// plan is written straight from `tools/scan-test-structure.mjs` output. The
// rewriter only ever does four mechanical things:
//
//   1. inserts the suite open/close lines around a line range;
//   2. indents every non-blank line of a wrapped range by one level per
//      enclosing suite, except lines inside a multi-line template literal,
//      whose leading whitespace is part of the string value;
//   3. shortens a case title by a literal leading subject phrase and then a
//      literal leading category phrase; any title that does not begin with the
//      phrase is kept verbatim;
//   4. adds `describe` to the existing `vitest` import (or a new import line).
//
// Nothing else moves: no assertion, fixture, body, import target or statement
// order is touched.
//
// Usage:
//   node tools/apply-taxonomy-a4.mjs <plan.json> [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { scan } from './scan-test-structure.mjs';

const INDENT = '    ';

function statementTitle(head) {
    const match = /^(?:test|nodeTest|it)\s*\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/.exec(head);
    if (!match) return null;
    return match[1] ?? match[2] ?? null;
}

function isTestStatement(statement) {
    return /^(?:test|nodeTest|it)\s*\(/.test(statement.head);
}

function escapeTitle(title) {
    return title.replace(/'/g, "\\'");
}

function addDescribeImport(text, path) {
    const pattern = /(import \{ )([^}]*)( \} from (?:'vitest'|"vitest");)/;
    if (!pattern.test(text)) {
        throw new Error(`${path}: no single-line \`import { ... } from 'vitest';\` to extend`);
    }
    return text.replace(pattern, (match, head, names, tail) => {
        const list = names
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length > 0);
        if (list.includes('describe')) return match;
        return `${head}${['describe', ...list].join(', ')}${tail}`;
    });
}

function addDescribeImportLine(text) {
    if (/import \{[^}]*\bdescribe\b[^}]*\} from (?:'vitest'|"vitest");/.test(text)) return text;
    const lines = text.split('\n');
    const firstImport = lines.findIndex((line) => /^import\b/.test(line));
    const insertAt = firstImport < 0 ? 0 : firstImport + 1;
    lines.splice(insertAt, 0, "import { describe } from 'vitest';");
    return lines.join('\n');
}

function rewrite(entry, workspaceRoot, dryRun) {
    const absolute = resolve(workspaceRoot, entry.path);
    const text = readFileSync(absolute, 'utf8');
    const { lines, statements, templateLines } = scan(text);

    if (!entry.subjectLines || entry.subjectLines.length !== 2) {
        throw new Error(`${entry.path}: subjectLines must be a [from, to] line pair`);
    }
    const [subjectFrom, subjectTo] = entry.subjectLines;

    const indentLevels = new Array(lines.length).fill(0);
    for (let position = subjectFrom - 1; position <= subjectTo - 1; position += 1) {
        indentLevels[position] += 1;
    }

    const categories = entry.categories ?? [];
    for (const category of categories) {
        const [from, to] = category.lines;
        for (let position = from - 1; position <= to - 1; position += 1) {
            indentLevels[position] += 1;
        }
    }

    // Which title gets shortened, by how much.
    const trims = [];
    for (const statement of statements) {
        if (!isTestStatement(statement)) continue;
        const original = statementTitle(statement.head);
        if (original === null) continue;

        let title = original;
        if (title.startsWith(`${entry.subject} `)) title = title.slice(entry.subject.length + 1);

        const lineNumber = statement.startLine + 1;
        const category = categories.find((candidate) => {
            const [from, to] = candidate.lines;
            return lineNumber >= from && lineNumber <= to;
        });
        if (category && title.startsWith(`${category.title} `)) {
            title = title.slice(category.title.length + 1);
        }
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
    const pushOpen = (at, payload) => {
        if (!opens.has(at)) opens.set(at, []);
        opens.get(at).push(payload);
    };
    const pushClose = (at, payload) => {
        if (!closes.has(at)) closes.set(at, []);
        closes.get(at).push(payload);
    };

    pushOpen(subjectFrom - 1, {
        line: `${entry.wrapper ?? 'test.describe'}('${escapeTitle(entry.subject)}', () => {`,
        blank: true,
        depth: 0,
    });
    pushClose(subjectTo - 1, INDENT.repeat(0) + '});');

    for (const category of categories) {
        const [from, to] = category.lines;
        pushOpen(from - 1, {
            line: `${INDENT}${entry.categoryWrapper ?? 'test.describe'}('${escapeTitle(category.title)}', () => {`,
            blank: false,
            depth: 1,
        });
        pushClose(to - 1, `${INDENT}});`);
    }
    // Inner suites close before their parent when they end on the same line.
    for (const list of closes.values()) list.sort((left, right) => right.length - left.length);

    const out = [];
    for (let position = 0; position < lines.length; position += 1) {
        for (const open of opens.get(position) ?? []) {
            const previous = out[out.length - 1];
            const previousIsComment = previous !== undefined && /^\s*(\/\/|\*|\/\*)/.test(previous);
            if (open.blank && previous !== undefined && previous.trim().length > 0 && !previousIsComment) {
                out.push('');
            }
            out.push(open.line);
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

    let result = out.join('\n');
    if (entry.importDescribe === 'extend') {
        result = addDescribeImport(result, entry.path);
    } else if (entry.importDescribe === 'new') {
        result = addDescribeImportLine(result);
    }

    if (!dryRun) writeFileSync(absolute, result);

    return { path: entry.path, subjectLines: [subjectFrom, subjectTo], categories: categories.length, trims };
}

const [, , planPath, ...flags] = process.argv;
if (!planPath) {
    console.error('usage: apply-taxonomy-a4.mjs <plan.json> [--dry-run]');
    process.exit(2);
}

const workspaceRoot = process.cwd();
let plan;
try {
    plan = JSON.parse(readFileSync(planPath, 'utf8'));
} catch (error) {
    console.error(`could not read plan ${planPath}: ${error.message}`);
    process.exit(2);
}

for (const entry of plan.files) {
    const report = rewrite(entry, workspaceRoot, flags.includes('--dry-run'));
    console.log(
        `${report.path.padEnd(58)} subject=${JSON.stringify(entry.subject).padEnd(38)} lines=${report.subjectLines.join('-')} categories=${report.categories} trimmed=${String(report.trims.length).padStart(3)}`,
    );
    for (const trim of report.trims) {
        console.log(`      - ${JSON.stringify(trim.original)}\n        ${JSON.stringify(trim.title)}`);
    }
}
