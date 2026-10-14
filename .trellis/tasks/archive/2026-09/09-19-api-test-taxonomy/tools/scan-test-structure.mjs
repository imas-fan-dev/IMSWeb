#!/usr/bin/env node
// Minimal JS/TS scanner used to inventory the top-level statements of a test
// file. It is deliberately not a parser: it only needs to answer "does this
// line / offset sit at brace depth zero, outside a string, comment, or regex
// literal?", which is what the taxonomy codemod needs in order to insert
// `test.describe(...)` wrappers without moving anything else.
//
// It is exported as a module (`scan`, `classify`) so both the inventory tool
// and the rewriter share one implementation.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} text
 * @returns {{ lines: string[], statements: Array<{ start: number, end: number, startLine: number, endLine: number, head: string }>, templateLines: Set<number> }}
 */
export function scan(text) {
    const lines = text.split('\n');

    // Offsets of the first character of each line.
    const lineStart = [];
    let offset = 0;
    for (const line of lines) {
        lineStart.push(offset);
        offset += line.length + 1;
    }
    const statements = [];
    const templateLines = new Set();

    // Statement accumulation state.
    let statementStart = -1;
    let statementStartLine = -1;
    let depth = 0;
    // Depth of one nesting level expressed in `(`, `[`, `{` characters.
    let depthChars = [];

    let index = 0;
    /** @type {'code'|'line-comment'|'block-comment'|'single'|'double'|'template'} */
    let mode = 'code';
    /** @type {number[]} */
    let templateBraceStack = [];
    let lastSignificant = '';

    const lineOf = (position) => {
        // Binary search would be premature; the longest file is ~1000 lines.
        let low = 0;
        let high = lineStart.length - 1;
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (lineStart[middle] <= position) low = middle;
            else high = middle - 1;
        }
        return low;
    };
    const flush = (position) => {
        if (statementStart < 0) return;
        const raw = text.slice(statementStart, position);
        if (raw.trim().length === 0) {
            statementStart = -1;
            return;
        }
        statements.push({
            start: statementStart,
            end: position,
            startLine: statementStartLine,
            endLine: lineOf(position - 1),
            head: raw.trim().slice(0, 120),
        });
        statementStart = -1;
    };
    while (index < text.length) {
        const character = text[index];
        const next = text[index + 1];
        if (mode === 'line-comment') {
            if (character === '\n') mode = 'code';
            index += 1;
            continue;
        }
        if (mode === 'block-comment') {
            if (character === '*' && next === '/') {
                mode = 'code';
                index += 2;
                continue;
            }
            index += 1;
            continue;
        }
        if (mode === 'single' || mode === 'double') {
            if (character === '\\') {
                // A backslash-newline keeps the literal open on the next line,
                // whose indentation is still part of the string value.
                if (next === '\n') templateLines.add(lineOf(index) + 1);
                index += 2;
                continue;
            }
            if ((mode === 'single' && character === "'") || (mode === 'double' && character === '"')) {
                mode = 'code';
                lastSignificant = 'string';
            }
            index += 1;
            continue;
        }
        if (mode === 'template') {
            if (character === '\\') {
                if (next === '\n') templateLines.add(lineOf(index) + 1);
                index += 2;
                continue;
            }
            if (character === '`' && templateBraceStack.length === 0) {
                mode = 'code';
                lastSignificant = 'string';
                index += 1;
                continue;
            }
            if (character === '$' && next === '{') {
                templateBraceStack.push(0);
                index += 2;
                continue;
            }
            if (templateBraceStack.length > 0) {
                if (character === '{') templateBraceStack[templateBraceStack.length - 1] += 1;
                if (character === '}') {
                    templateBraceStack[templateBraceStack.length - 1] -= 1;
                    if (templateBraceStack[templateBraceStack.length - 1] < 0) {
                        templateBraceStack.pop();
                    }
                }
                index += 1;
                continue;
            }
            if (character === '\n') templateLines.add(lineOf(index) + 1);
            index += 1;
            continue;
        }
        // mode === 'code'
        if (character === '/' && next === '/') {
            mode = 'line-comment';
            index += 2;
            continue;
        }
        if (character === '/' && next === '*') {
            mode = 'block-comment';
            index += 2;
            continue;
        }
        if (character === "'") {
            mode = 'single';
            index += 1;
            continue;
        }
        if (character === '"') {
            mode = 'double';
            index += 1;
            continue;
        }
        if (character === '`') {
            mode = 'template';
            templateBraceStack = [];
            index += 1;
            continue;
        }
        if (character === '/' && /[=(,:[!&|?{};+\-*%<>~^]|^$/.test(lastSignificant)) {
            // Regex literal: only reachable where a value is expected. Walk to
            // the closing slash so a `/` inside the pattern is not mistaken for
            // division or for the start of a comment.
            let cursor = index + 1;
            let inClass = false;
            while (cursor < text.length) {
                const current = text[cursor];
                if (current === '\\') {
                    cursor += 2;
                    continue;
                }
                if (current === '\n') break;
                if (current === '[') inClass = true;
                else if (current === ']') inClass = false;
                else if (current === '/' && !inClass) break;
                cursor += 1;
            }
            index = cursor + 1;
            lastSignificant = 'regex';
            continue;
        }
        if (character === '\n') {
            if (depth === 0) flush(index + 1);
            index += 1;
            continue;
        }
        if (character === ' ' || character === '\t' || character === '\r') {
            index += 1;
            continue;
        }
        if (character === '(' || character === '[' || character === '{') {
            if (statementStart < 0) {
                statementStart = index;
                statementStartLine = lineOf(index);
            }
            depth += 1;
            depthChars.push(character);
            lastSignificant = character;
            index += 1;
            continue;
        }
        if (character === ')' || character === ']' || character === '}') {
            depth -= 1;
            depthChars.pop();
            lastSignificant = character;
            index += 1;
            if (depth === 0) {
                // A statement can end at the matching close plus a following
                // `;` or newline; the newline path flushes it.
            }
            continue;
        }
        if (character === ';' && depth === 0) {
            lastSignificant = ';';
            index += 1;
            flush(index);
            continue;
        }
        if (statementStart < 0) {
            statementStart = index;
            statementStartLine = lineOf(index);
        }
        lastSignificant = character;
        index += 1;
    }
    flush(text.length);
    return { lines, statements, templateLines };
}
/**
 * The Vitest name a statement registers under, or `null` when it is not a
 * statically-named `test(...)` / `describe(...)` call.
 *
 * @param {string} head
 * @returns {{ kind: 'test'|'describe'|'other', staticName: string | null }}
 */
export function classify(head) {
    const match = /^(test|describe|it)\s*(?:\.\s*(\w+)\s*)?\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")?/.exec(head);
    if (!match) return { kind: 'other', staticName: null };
    const base = match[1];
    const modifier = match[2] ?? null;
    const staticName = match[3] ?? match[4] ?? null;
    if (modifier === 'describe') return { kind: 'describe', staticName };
    if (base === 'test' || base === 'it') {
        return { kind: modifier === null || modifier === 'only' || modifier === 'skip' ? 'test' : 'other', staticName };
    }
    return { kind: 'describe', staticName };
}
/** Program entry: `node tools/scan-test-structure.mjs <file> [...]`. */
function main(paths) {
    for (const filePath of paths) {
        const text = readFileSync(filePath, 'utf8');
        const { statements, templateLines } = scan(text);
        console.log(`### ${filePath}`);
        statements.forEach((statement, position) => {
            const { kind, staticName } = classify(statement.head);
            const label = staticName === null ? statement.head.replace(/\s+/g, ' ') : staticName;
            console.log(
                `  [${String(position).padStart(2)}] L${String(statement.startLine + 1).padStart(4)}-${String(
                    statement.endLine + 1,
                ).padStart(4)}  ${kind.padEnd(8)} ${label}`,
            );
        });
        if (templateLines.size > 0) {
            const sorted = [...templateLines].sort((left, right) => left - right);
            console.log(`  template-literal lines (not reindented): ${sorted.map((line) => line + 1).join(',')}`);
        }
    }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2));
}
