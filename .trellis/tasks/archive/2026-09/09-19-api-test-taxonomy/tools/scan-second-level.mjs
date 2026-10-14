#!/usr/bin/env node
// Find second-level `describe` candidates across the API test tree.
//
// A candidate is a contiguous run of >=2 sibling cases that sit directly in a
// subject suite and share an identical literal prefix of >=3 words -- the
// machine-checkable criterion batch A3 settled on, so the whole tree can be
// compared under one rule instead of batch-by-batch judgement.
//
// A case is a candidate only when its parent is the *outermost* describe of its
// block, because the two-level rule caps nesting there. Merged files put each
// former file's subject suite at one indent level inside a lexical block, so
// "outermost describe" is what identifies the subject layer, not column zero.
//
// Usage:
//   node tools/scan-second-level.mjs <tests-dir> [--json <out.json>] [--a1 <a1-plan.json>]

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MIN_PREFIX_WORDS = 3;
const MIN_RUN = 2;

const CASE_START = /^(\s*)(?:(test|postgresTest|it)(?:\.\w+)?)\(\s*(['"`])(.*)$/;
const DESCRIBE_START = /^(\s*)(?:(?:test|it)\.)?describe\(\s*(['"`])([^'"`]*)\2/;
const MEMBER_MARKER = /^\/\/ ([a-z0-9][\w.-]*\.test\.[a-z]+)$/;

function indentWidth(line) {
    const match = /^(\s*)/.exec(line);
    return match[1].replace(/\t/g, '    ').length;
}

// A case declaration may put its title on the next line. Only the first two
// lines are searched, which covers every shape in this tree.
function caseTitle(lines, index) {
    const start = CASE_START.exec(lines[index]);
    if (!start) return null;
    const [, , callee, quote, tail] = start;
    const inline = new RegExp(`^([^${quote}]*)${quote}`).exec(tail);
    if (inline) return { callee, title: inline[1], quote };
    for (let offset = 1; offset <= 2 && index + offset < lines.length; offset += 1) {
        const next = lines[index + offset];
        const match = new RegExp(`^\\s*${quote}([^${quote}]*)${quote}`).exec(next);
        if (match) return { callee, title: match[1], quote };
    }
    return { callee, title: null, quote };
}

function scanFile(text) {
    const lines = text.split('\n');
    const stack = [];
    const cases = [];
    const members = new Map();
    for (let index = 0; index < lines.length; index += 1) {
        const marker = MEMBER_MARKER.exec(lines[index]);
        if (marker) members.set(index, marker[1]);
    }
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const width = indentWidth(line);
        const describe = DESCRIBE_START.exec(line);
        if (describe) {
            while (stack.length && stack[stack.length - 1].indent >= width) stack.pop();
            stack.push({ title: describe[3], indent: width, line: index });
            continue;
        }
        const found = caseTitle(lines, index);
        if (!found) continue;
        while (stack.length && stack[stack.length - 1].indent >= width) stack.pop();
        // A declaration with no resolvable literal is dynamic (`test(entry.name)`);
        // it cannot join a run, so it acts as a barrier.
        cases.push({
            line: index,
            indent: width,
            callee: found.callee,
            title: found.title,
            depth: stack.length,
            parent: stack.length ? stack[stack.length - 1].title : null,
            parentLine: stack.length ? stack[stack.length - 1].line : null,
        });
    }
    let member = null;
    for (const entry of cases) {
        for (const [line, name] of members) if (line < entry.line) member = name;
        entry.member = member;
    }
    return { lines, cases, members };
}

// The longest word prefix of the run, or null when it is shorter than the rule
// requires. `null` also covers the case where the run is broken by a
// non-declaration line.
function commonPrefix(titles) {
    const words = titles.map((title) => title.split(' '));
    const limit = Math.min(...words.map((entry) => entry.length));
    let count = 0;
    while (count < limit && words.every((entry) => entry[count] === words[0][count])) {
        count += 1;
    }
    return count >= MIN_PREFIX_WORDS ? words[0].slice(0, count).join(' ') : null;
}

// Two cases are contiguous when nothing *at their own indentation* sits
// between them. A case body is indented deeper, and its closing `});` is
// skipped, so only a real sibling statement (a helper, a hook, a nested suite)
// breaks a run. A multi-line string or template interior whose leading
// whitespace happens to match is a false break, which only loses a candidate.
function siblingBreak(lines, from, to, indent) {
    for (let index = from + 1; index < to; index += 1) {
        const line = lines[index];
        if (/^\s*$/.test(line) || /^\s*\/\//.test(line)) continue;
        if (/^\s*[)};,]+$/.test(line)) continue;
        if (indentWidth(line) === indent) return true;
    }
    return false;
}

function findRuns(file) {
    const { lines, cases } = scanFile(file.text);
    const groups = new Map();
    for (const entry of cases) {
        // Only the subject layer: the parent describe must be the outermost one.
        if (entry.depth !== 1) continue;
        const key = `${entry.parentLine}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
    }
    const runs = [];
    for (const siblings of groups.values()) {
        let index = 0;
        while (index < siblings.length) {
            const run = [siblings[index]];
            let next = index + 1;
            while (next < siblings.length) {
                const candidate = siblings[next];
                const previous = run[run.length - 1];
                if (siblingBreak(lines, previous.line, candidate.line, previous.indent)) break;
                if (candidate.title === null) break;
                const trial = [...run, candidate];
                if (trial.some((entry) => entry.title === null)) break;
                if (commonPrefix(trial.map((entry) => entry.title)) === null) break;
                run.push(candidate);
                next += 1;
            }
            if (run.length >= MIN_RUN) {
                runs.push({
                    parent: run[0].parent,
                    parentLine: run[0].parentLine,
                    member: run[0].member,
                    fromLine: run[0].line + 1,
                    toLine: run[run.length - 1].line + 1,
                    count: run.length,
                    phrase: commonPrefix(run.map((entry) => entry.title)),
                    titles: run.map((entry) => entry.title),
                });
            }
            index = Math.max(next, index + 1);
        }
    }
    return runs;
}

function walk(dir, out = []) {
    for (const name of readdirSync(dir).sort()) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (/\.test\.[cm]?[jt]s$/.test(name)) out.push(path);
    }
    return out;
}

const [dirArg, ...rest] = process.argv.slice(2);
const invokedDirectly = process.argv[1]?.includes('scan-second-level');
if (!dirArg || !invokedDirectly) {
    if (!invokedDirectly) {
        // Imported for its scanners; the caller owns the run.
    } else {
        console.error('usage: scan-second-level.mjs <tests-dir> [--json <out>] [--a1 <plan>]');
        process.exit(2);
    }
}
const jsonIndex = rest.indexOf('--json');
const a1Index = rest.indexOf('--a1');
const a1Plan = a1Index >= 0
    ? new Set(JSON.parse(readFileSync(rest[a1Index + 1], 'utf8')).files
        .map((entry) => entry.path.split('/').pop()))
    : null;

if (invokedDirectly) {
    const root = resolve(dirArg);
    const report = [];
    for (const path of walk(root)) {
        const runs = findRuns({ text: readFileSync(path, 'utf8') });
        if (!runs.length) continue;
        report.push({ path: relative(process.cwd(), path), runs });
    }

    let total = 0;
    for (const file of report) {
        console.log(`\n${file.path}  (${file.runs.length} run(s))`);
        for (const run of file.runs) {
            total += 1;
            const origin = a1Plan && run.member && a1Plan.has(run.member) ? ' [A1]' : '';
            console.log(`  L${run.fromLine}-${run.toLine} ×${run.count}  parent="${run.parent}" member=${run.member ?? '(single)'}${origin}`);
            console.log(`      phrase: "${run.phrase}"`);
        }
    }
    console.log(`\n合计 ${total} 个候选段，覆盖 ${report.length} 个文件`);
    if (jsonIndex >= 0) {
        writeFileSync(rest[jsonIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
        console.log(`已写入 ${rest[jsonIndex + 1]}`);
    }
}

export { commonPrefix, findRuns, scanFile, siblingBreak, walk };
