#!/usr/bin/env node
// Apply a taxonomy plan to test files.
//
// The plan names, per file, the top-level subject and the case-declaration
// indices that belong under it. The rewriter then does exactly two things,
// mechanically:
//
//   1. wraps the trailing `test(...)` declarations in one `describe(...)`
//      block, keeping their order and their relative blank lines;
//   2. indents each wrapped declaration by one level (4 spaces) and shortens a
//      case title only by a literal leading subject phrase -- a title that does
//      not begin with the subject is kept verbatim.
//
// Lines inside a multi-line template literal are never re-indented, because
// their leading whitespace is part of the string value.
//
// Usage:
//   node tools/apply-taxonomy.mjs <plan.json> [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { classify, scan } from './scan-test-structure.mjs';

const INDENT = '    ';

/**
 * @param {{ path: string, subject: string, wrapper?: string, importVitestDescribe?: boolean, cases: number[] }} entry
 * @param {string} workspaceRoot
 */
function rewrite(entry, workspaceRoot, dryRun) {
    const absolute = resolve(workspaceRoot, entry.path);
    const text = readFileSync(absolute, 'utf8');
    const { lines, statements, templateLines } = scan(text);

    const members = statements
        .map((statement, position) => ({ statement, position }))
        .filter(({ statement }) => classify(statement.head).kind === 'test');

    const indices = members.map(({ position: position }) => position);
    if (indices.join(',') !== entry.cases.join(',')) {
        throw new Error(
            `${entry.path}: plan indices ${entry.cases.join(',')} do not match the file's test statements ${indices.join(',')}`,
        );
    }

    const first = members[0];
    const last = members[members.length - 1];

    // Wrapping only a contiguous tail keeps every other statement -- imports,
    // fixtures, helpers, `beforeAll`/`afterAll` -- outside the new suite.
    const between = statements
        .slice(first.position, last.position + 1)
        .filter((statement) => classify(statement.head).kind !== 'test');
    if (between.length > 0) {
        throw new Error(
            `${entry.path}: ${between.length} non-test statement(s) sit between the first and last case`,
        );
    }

    const wrapper = entry.wrapper ?? 'test.describe';
    const trims = [];

    for (const { statement } of members) {
        const { staticName } = classify(statement.head);
        const prefix = `${entry.subject} `;
        const trimmed =
            staticName !== null && staticName.startsWith(prefix)
                ? staticName.slice(prefix.length)
                : staticName;

        // The title is the first string literal of the `test(...)` call, so the
        // replacement target is the whole quoted title including its closing
        // quote. A title the subject does not lead is left exactly as written.
        let trimLine = -1;
        let trimQuote = "'";
        if (staticName !== null && trimmed !== staticName) {
            for (let position = statement.startLine; position <= statement.endLine; position += 1) {
                const at = lines[position].indexOf(staticName);
                if (at < 0) continue;
                trimLine = position;
                trimQuote = lines[position][at + staticName.length] === '"' ? '"' : "'";
                break;
            }
            if (trimLine < 0) {
                throw new Error(
                    `${entry.path}: could not find ${JSON.stringify(staticName)} to trim inside its declaration`,
                );
            }
        }

        trims.push({
            statement,
            from: staticName,
            to: trimmed,
            trimLine,
            trimQuote,
        });
    }

    // Emit line by line: indentation for member lines, plus the wrapper lines.
    const out = [];

    const openLine = `${wrapper}('${entry.subject.replace(/'/g, "\\'")}', () => {`;
    const closeLine = `});`;

    for (let position = 0; position < lines.length; position += 1) {
        if (position === first.statement.startLine) {
            if (out.length > 0 && out[out.length - 1].trim().length > 0) out.push('');
            out.push(openLine);
        }

        let line = lines[position];

        const member = trims.find(
            ({ statement }) => position >= statement.startLine && position <= statement.endLine,
        );
        if (member) {
            if (!templateLines.has(position) && line.trim().length > 0) line = INDENT + line;
            if (member.trimLine === position) {
                line = line.replace(
                    `${member.from}${member.trimQuote}`,
                    `${member.to}${member.trimQuote}`,
                );
            }
        }

        out.push(line);

        if (position === last.statement.endLine) {
            out.push(closeLine);
        }
    }

    let result = out.join('\n');

    if (entry.importVitestDescribe) {
        const importPattern = /(import \{ )([^}]*)( \} from 'vitest';)/;
        if (!importPattern.test(result)) {
            throw new Error(`${entry.path}: no \`import { ... } from 'vitest';\` line to extend`);
        }
        result = result.replace(importPattern, (match, head, names, tail) => {
            const list = names
                .split(',')
                .map((name) => name.trim())
                .filter((name) => name.length > 0);
            if (list.includes('describe')) return match;
            return `${head}${['describe', ...list].join(', ')}${tail}`;
        });
    }

    if (!dryRun) writeFileSync(absolute, result);

    return { path: entry.path, members: members.length, trimmed: trims.filter(({ from, to }) => from !== null && from !== to).length };
}

const [, , planPath, ...flags] = process.argv;
if (!planPath) {
    console.error('usage: apply-taxonomy.mjs <plan.json> [--dry-run]');
    process.exit(2);
}

const workspaceRoot = process.cwd();
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

for (const entry of plan.files) {
    const report = rewrite(entry, workspaceRoot, flags.includes('--dry-run'));
    console.log(
        `${entry.path.padEnd(58)} subject=${JSON.stringify(entry.subject).padEnd(40)} cases=${report.members} trimmed=${report.trimmed}`,
    );
}
