#!/usr/bin/env node
// Apply a taxonomy plan to test files, with two extensions over
// `apply-taxonomy.mjs` that the A2 slice needs:
//
//   * `nested` -- one or more second-level `describe` suites over a contiguous
//     run of the wrapped cases (rule 3 of the batch brief);
//   * `includeInterleaved` -- when a helper declaration sits between the first
//     and the last case, the wrapper covers the whole statement run and the
//     helper moves inside the suite. Its position, order, body and call sites
//     are unchanged; a function declaration is hoisted inside the describe
//     callback and every call site lives in that same callback.
//
// Everything else is the same mechanical contract as the A1 tool: wrap the run
// of `test(...)` declarations, indent by 4 per level, shorten a case title only
// by a literal leading phrase the enclosing suite now carries, never re-indent a
// multi-line template literal's interior, and never touch a statement outside
// the wrapped run.
//
// Usage:
//   node tools/a2-apply-taxonomy.mjs <plan.json> [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { classify, scan } from './scan-test-structure.mjs';

const INDENT = '    ';

/**
 * @param {{
 *   path: string,
 *   subject: string,
 *   wrapper?: 'test.describe' | 'describe',
 *   importVitestDescribe?: boolean,
 *   importDescribeNew?: boolean,
 *   includeInterleaved?: boolean,
 *   cases: number[],
 *   nested?: Array<{ subject: string, cases: number[] }>
 * }} entry
 * @param {string} workspaceRoot
 * @param {boolean} dryRun
 */
function rewrite(entry, workspaceRoot, dryRun) {
    const absolute = resolve(workspaceRoot, entry.path);
    const text = readFileSync(absolute, 'utf8');
    const { lines, statements, templateLines } = scan(text);

    const members = statements
        .map((statement, position) => ({ statement, position }))
        .filter(({ statement }) => classify(statement.head).kind === 'test');

    const indices = members.map(({ position }) => position);
    if (indices.join(',') !== entry.cases.join(',')) {
        throw new Error(
            `${entry.path}: plan indices ${entry.cases.join(',')} do not match the file's test statements ${indices.join(',')}`,
        );
    }

    const first = members[0];
    const last = members[members.length - 1];

    const between = statements
        .slice(first.position, last.position + 1)
        .filter((statement) => classify(statement.head).kind !== 'test');
    if (!entry.includeInterleaved && between.length > 0) {
        throw new Error(
            `${entry.path}: ${between.length} statement(s) sit between the first and last case; set includeInterleaved`,
        );
    }

    const wrapper = entry.wrapper ?? 'test.describe';
    const quote = (name) => name.replace(/'/g, "\\'");
    const subjectOpen = `${wrapper}('${quote(entry.subject)}', () => {`;

    // Nested suites: each is a contiguous run of the wrapped cases.
    const nestedRuns = [];
    for (const group of entry.nested ?? []) {
        const positions = group.cases.map((index) => {
            const member = members.find(({ position }) => position === index);
            if (!member) throw new Error(`${entry.path}: nested case ${index} is not a wrapped case`);
            return member;
        });
        for (let offset = 1; offset < positions.length; offset += 1) {
            if (positions[offset].position !== positions[offset - 1].position + 1) {
                throw new Error(`${entry.path}: nested suite ${group.subject} is not contiguous`);
            }
        }
        if (positions.length < 2) {
            throw new Error(`${entry.path}: nested suite ${group.subject} needs at least two cases`);
        }
        nestedRuns.push({
            subject: group.subject,
            startLine: positions[0].statement.startLine,
            endLine: positions[positions.length - 1].statement.endLine,
            positions: positions.map(({ position }) => position),
            open: `${INDENT}${wrapper}('${quote(group.subject)}', () => {`,
        });
    }
    for (let left = 0; left < nestedRuns.length; left += 1) {
        for (let right = left + 1; right < nestedRuns.length; right += 1) {
            const [low, high] = [nestedRuns[left], nestedRuns[right]].sort((a, b) => a.startLine - b.startLine);
            if (low.endLine >= high.startLine) {
                throw new Error(`${entry.path}: nested suites ${low.subject} / ${high.subject} overlap`);
            }
        }
    }

    // Case-title shortening: the innermost suite's phrase is the one to absorb.
    const trims = new Map();
    for (const { statement, position } of members) {
        const run = nestedRuns.find((candidate) => candidate.positions.includes(position));
        const phrase = run ? run.subject : entry.subject;
        const { staticName } = classify(statement.head);
        const prefix = `${phrase} `;
        const trimmed =
            staticName !== null && staticName.startsWith(prefix) ? staticName.slice(prefix.length) : staticName;
        let trimLine = -1;
        if (staticName !== null && trimmed !== staticName) {
            for (let line = statement.startLine; line <= statement.endLine; line += 1) {
                if (lines[line].includes(staticName)) {
                    trimLine = line;
                    break;
                }
            }
            if (trimLine < 0) {
                throw new Error(`${entry.path}: could not locate ${JSON.stringify(staticName)} inside its declaration`);
            }
        }
        trims.set(statement, { from: staticName, to: trimmed, trimLine });
    }

    const out = [];
    const emit = (line) => out.push(line);

    for (let position = 0; position < lines.length; position += 1) {
        const inWrapper = position >= first.statement.startLine && position <= last.statement.endLine;
        const run = inWrapper
            ? nestedRuns.find((candidate) => candidate.startLine <= position && position <= candidate.endLine)
            : undefined;
        const level = inWrapper ? (run ? 2 : 1) : 0;

        if (position === first.statement.startLine) {
            if (out.length > 0 && out[out.length - 1].trim().length > 0) emit('');
            emit(subjectOpen);
        }
        if (run && position === run.startLine) {
            if (out.length > 0 && out[out.length - 1].trim().length > 0) emit('');
            emit(run.open);
        }

        let line = lines[position];

        // Indentation moves code lines only; a blank line and a multi-line
        // template literal's interior keep their bytes (that whitespace is part
        // of the string value).
        if (level > 0 && line.trim().length > 0 && !templateLines.has(position)) {
            line = INDENT.repeat(level) + line;
        }

        const member = members.find(
            ({ statement }) => position >= statement.startLine && position <= statement.endLine,
        );
        if (member) {
            const trim = trims.get(member.statement);
            if (trim && trim.trimLine === position && trim.from !== null && trim.from !== trim.to) {
                const at = line.indexOf(trim.from);
                if (at < 0) {
                    throw new Error(`${entry.path}: could not find ${JSON.stringify(trim.from)} to trim`);
                }
                line = line.slice(0, at) + trim.to + line.slice(at + trim.from.length);
            }
        }

        emit(line);

        if (run && position === run.endLine) emit(`${INDENT}});`);
        if (position === last.statement.endLine) emit('});');
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

    if (entry.importDescribeNew) {
        if (result.includes("from 'vitest'") || result.includes('from "vitest"')) {
            throw new Error(`${entry.path}: file already imports from vitest; use importVitestDescribe`);
        }
        const importStatements = statements.filter((statement) => /^import\b/.test(statement.head));
        if (importStatements.length === 0) throw new Error(`${entry.path}: no import statements to anchor`);
        const anchor = importStatements[importStatements.length - 1].endLine;
        if (anchor >= first.statement.startLine) {
            throw new Error(`${entry.path}: last import is not above the first case`);
        }
        const rebuilt = result.split('\n');
        rebuilt.splice(anchor + 1, 0, "import { describe } from 'vitest';");
        result = rebuilt.join('\n');
    }

    if (!dryRun) writeFileSync(absolute, result);

    return {
        path: entry.path,
        members: members.length,
        nested: nestedRuns.map((candidate) => `${candidate.subject}=${candidate.positions.length}`),
        trimmed: [...trims.values()].filter(({ from, to }) => from !== null && from !== to).length,
    };
}

const [, , planPath, ...flags] = process.argv;
if (!planPath) {
    console.error('usage: a2-apply-taxonomy.mjs <plan.json> [--dry-run]');
    process.exit(2);
}

const workspaceRoot = process.cwd();
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

for (const entry of plan.files) {
    const report = rewrite(entry, workspaceRoot, flags.includes('--dry-run'));
    console.log(
        `${report.path.padEnd(58)} subject=${JSON.stringify(entry.subject).padEnd(36)} cases=${report.members} trimmed=${report.trimmed} nested=[${report.nested.join(' ')}]`,
    );
}
