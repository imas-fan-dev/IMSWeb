#!/usr/bin/env node
// Apply a *segmented* taxonomy plan to test files (batch A3).
//
// `apply-taxonomy.mjs` (A1) wraps one contiguous run of `test(...)`
// declarations in a single `describe`. Batch A3 needs three things that tool
// deliberately refuses:
//
//   1. a file may hold more than one contiguous run of declarations, separated
//      by a helper function (which must stay at module scope);
//   2. a run may hold statements that are not `test(...)` calls -- a case table
//      plus the `for` loop that registers from it -- because the registration
//      has to end up inside the suite;
//   3. a file may already own a `describe` whose title has to be shortened to
//      become the second level of the new hierarchy.
//
// The plan therefore names, per file, an ordered list of *segments*:
//
//   { "path": ["subject"], "from": <stmt>, "to": <stmt> }
//   { "path": ["subject", "category"], "from": <stmt>, "to": <stmt> }
//   { "path": ["subject", "category"], "from": <stmt>, "to": <stmt>, "existingSuite": true }
//
// Statements come from `scan-test-structure.mjs` (same shared scanner the A1
// tools use). A segment's `path` is the describe chain its statements belong
// under. Consecutive segments that share `path[0]` are emitted inside one
// top-level suite. `existingSuite` marks a segment that already *is* the
// second-level `describe`: its own line supplies that level, so it is indented
// by one level only and its title is shortened by the ancestor prefix.
//
// Two things are done to the declarations, mechanically:
//   * every line of the segment range is indented by the number of describe
//     levels opened around it (lines inside multi-line template literals are
//     never touched -- their whitespace is part of the string value);
//   * a case title is shortened only by a literal leading phrase of the suite
//     path: the longest suffix of `path` that the title begins with. A title
//     the path does not lead is kept verbatim.
//
// Usage:
//   node tools/apply-taxonomy-a3.mjs <plan.json> [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { classify, scan } from './scan-test-structure.mjs';

const INDENT = '    ';

/** @param {{ path: string[], from: number, to: number, existingSuite?: boolean }} segment */
function segmentIndent(segment) {
    return segment.existingSuite ? segment.path.length - 1 : segment.path.length;
}

/**
 * Longest literal leading phrase of `title` taken from the tail of `path`.
 * Returns null when no suffix of the path leads the title.
 */
function absorbedPrefix(title, path) {
    for (let count = path.length; count >= 1; count -= 1) {
        const phrase = `${path.slice(path.length - count).join(' ')} `;
        if (title.startsWith(phrase)) return phrase;
    }
    return null;
}

/**
 * @param {{ path: string, wrapper?: string, importVitestDescribe?: boolean,
 *           addVitestImport?: boolean, addVitestImportAfterLine?: number,
 *           addVitestImportQuote?: string, segments: object[] }} entry
 */
function rewrite(entry, workspaceRoot, dryRun) {
    const absolute = resolve(workspaceRoot, entry.path);
    const text = readFileSync(absolute, 'utf8');
    const { lines, statements, templateLines } = scan(text);

    const segments = entry.segments;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (segment.from > segment.to) throw new Error(`${entry.path}: segment ${index} has from > to`);
        if (segment.from < 0 || segment.to >= statements.length) {
            throw new Error(`${entry.path}: segment ${index} is outside the statement list`);
        }
        const previous = segments[index - 1];
        if (previous && previous.path[0] === segment.path[0] && previous.to >= segment.from) {
            throw new Error(`${entry.path}: segment ${index} overlaps the previous segment`);
        }
        if (previous && previous.path[0] !== segment.path[0] && previous.to >= segment.from) {
            throw new Error(`${entry.path}: segment ${index} overlaps the previous segment`);
        }
        const suite = statements[segment.from];
        if (segment.existingSuite && classify(suite.head).kind !== 'describe') {
            throw new Error(`${entry.path}: segment ${index} is marked existingSuite but is not a describe`);
        }
    }

    const wrapper = entry.wrapper ?? 'test.describe';
    const trims = [];
    const retitles = [];
    const indentByLine = new Map();

    for (const segment of segments) {
        const indentLevels = segmentIndent(segment);
        for (let line = statements[segment.from].startLine; line <= statements[segment.to].endLine; line += 1) {
            indentByLine.set(line, (indentByLine.get(line) ?? 0) + indentLevels);
        }
        for (let position = segment.from; position <= segment.to; position += 1) {
            const statement = statements[position];
            const { kind, staticName } = classify(statement.head);

            if (kind === 'describe') {
                // An existing suite supplies its own level; only the ancestor
                // prefix has to come off its title.
                const ancestor = `${segment.path.slice(0, -1).join(' ')} `;
                if (segment.path.length < 2 || !staticName?.startsWith(ancestor)) {
                    throw new Error(
                        `${entry.path}: describe at statement ${position} does not start with the ancestor path`,
                    );
                }
                retitles.push({ statement, from: staticName, to: staticName.slice(ancestor.length) });
                continue;
            }

            if (kind !== 'test' || staticName === null) continue;

            const phrase = absorbedPrefix(staticName, segment.path);
            if (phrase === null) continue;
            const trimmed = staticName.slice(phrase.length);

            let trimLine = -1;
            let trimQuote = "'";
            for (let line = statement.startLine; line <= statement.endLine; line += 1) {
                const at = lines[line].indexOf(staticName);
                if (at < 0) continue;
                trimLine = line;
                trimQuote = lines[line][at + staticName.length] === '"' ? '"' : "'";
                break;
            }
            if (trimLine < 0) {
                throw new Error(
                    `${entry.path}: could not find ${JSON.stringify(staticName)} inside its declaration`,
                );
            }
            trims.push({ statement, from: staticName, to: trimmed, trimLine, trimQuote });
        }
    }

    const trimByLine = new Map(trims.map((trim) => [trim.trimLine, trim]));
    const retitleByLine = new Map(retitles.map((retitle) => [retitle.statement.startLine, retitle]));

    const opener = (level, title) => `${INDENT.repeat(level)}${wrapper}('${title.replace(/'/g, "\\'")}', () => {`;
    const closer = (level) => `${INDENT.repeat(level)}});`;

    const out = [];
    const push = (value) => out.push(value);
    const dropTrailingBlanks = () => {
        while (out.length > 0 && out[out.length - 1].trim().length === 0) out.pop();
    };
    const open = (level, title) => {
        if (out.length > 0 && out[out.length - 1].trim().length > 0 && !lastWasOpener) push('');
        push(opener(level, title));
        lastWasOpener = true;
    };
    const closeSuite = (level) => {
        dropTrailingBlanks();
        push(closer(level));
        lastWasOpener = false;
    };

    let currentParent = null;
    let nestedOpen = false;
    let lastWasOpener = false;

    const closeNested = () => {
        if (nestedOpen) {
            closeSuite(1);
            nestedOpen = false;
        }
    };

    const openAt = new Map();
    const closeAt = new Map();
    // A parent suite ends with the last segment that belongs to it, not with the
    // first segment of the next subject -- otherwise whatever sits between the
    // two groups (a helper function, a fixture) would fall inside the suite.
    segments.forEach((segment, index) => {
        openAt.set(statements[segment.from].startLine, segment);
        closeAt.set(statements[segment.to].endLine, {
            segment,
            closesParent: segments[index + 1]?.path[0] !== segment.path[0],
        });
    });

    // Walk every line: lines outside any segment (imports, helpers, fixtures)
    // are emitted untouched, which is what keeps them outside the suites.
    for (let line = 0; line < lines.length; line += 1) {
        const opening = openAt.get(line);
        if (opening) {
            if (opening.path[0] !== currentParent) {
                closeNested();
                if (currentParent !== null) closeSuite(0);
                open(0, opening.path[0]);
                currentParent = opening.path[0];
            } else {
                closeNested();
            }
            if (opening.path.length === 2 && !opening.existingSuite) {
                open(1, opening.path[1]);
                nestedOpen = true;
            }
        }

        let value = lines[line];
        const extra = indentByLine.get(line) ?? 0;
        if (extra > 0 && !templateLines.has(line) && value.trim().length > 0) {
            value = INDENT.repeat(extra) + value;
        }
        const retitle = retitleByLine.get(line);
        if (retitle) {
            const quote = value.includes(`${retitle.from}"`) ? '"' : "'";
            value = value.replace(`${retitle.from}${quote}`, `${retitle.to}${quote}`);
        }
        const trim = trimByLine.get(line);
        if (trim) value = value.replace(`${trim.from}${trim.trimQuote}`, `${trim.to}${trim.trimQuote}`);
        push(value);
        lastWasOpener = false;

        const closing = closeAt.get(line);
        if (closing) {
            closeNested();
            if (closing.closesParent) {
                closeSuite(0);
                currentParent = null;
            }
        }
    }
    closeNested();
    if (currentParent !== null) closeSuite(0);

    let result = out.join('\n');

    // `dropTrailingBlanks` can consume the empty element that carried the file's
    // final newline, so the original terminator is restored explicitly.
    if (text.endsWith('\n') && !result.endsWith('\n')) result = `${result}\n`;

    if (entry.importVitestDescribe) {
        const pattern = /(import \{ )([^}]*)( \} from ['"]vitest['"];)/;
        if (!pattern.test(result)) throw new Error(`${entry.path}: no vitest named import to extend`);
        result = result.replace(pattern, (match, head, names, tail) => {
            const list = names
                .split(',')
                .map((name) => name.trim())
                .filter((name) => name.length > 0);
            if (list.includes('describe')) return match;
            return `${head}${['describe', ...list].join(', ')}${tail}`;
        });
    }

    if (entry.addVitestImport) {
        const quote = entry.addVitestImportQuote ?? "'";
        const line = `import { describe } from ${quote}vitest${quote};`;
        const anchor = entry.addVitestImportAfterLine;
        if (typeof anchor !== 'number') throw new Error(`${entry.path}: addVitestImport needs an anchor line`);
        const rows = result.split('\n');
        rows.splice(anchor, 0, line);
        result = rows.join('\n');
    }

    if (!dryRun) writeFileSync(absolute, result);

    return {
        path: entry.path,
        segments: segments.length,
        suites: new Set(segments.map((segment) => segment.path[0])).size,
        nested: segments.filter((segment) => segment.path.length > 1).length,
        trimmed: trims.filter((trim) => trim.from !== trim.to).length,
    };
}

const [, , planPath, ...flags] = process.argv;
if (!planPath) {
    console.error('usage: apply-taxonomy-a3.mjs <plan.json> [--dry-run]');
    process.exit(2);
}

const workspaceRoot = process.cwd();
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

let files = 0;
let suites = 0;
let nested = 0;
let trimmed = 0;

for (const entry of plan.files) {
    const report = rewrite(entry, workspaceRoot, flags.includes('--dry-run'));
    files += 1;
    suites += report.suites;
    nested += report.nested;
    trimmed += report.trimmed;
    console.log(
        `${report.path.padEnd(58)} suites=${String(report.suites).padStart(2)} segments=${String(
            report.segments,
        ).padStart(2)} nested=${String(report.nested).padStart(2)} trimmed=${String(report.trimmed).padStart(2)}`,
    );
}

console.log(`\nfiles=${files} suites=${suites} nestedSegments=${nested} trimmedTitles=${trimmed}`);
