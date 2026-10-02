#!/usr/bin/env node
// Propose a two-level taxonomy for a test file from the runner's own names.
//
// The rule is the mechanical one from the task design:
//   * top-level subject = the leading word phrase the cases share most often
//     (longest phrase on a coverage tie), so that every case that begins with
//     it keeps its original words after the phrase is removed;
//   * second level = behaviour categories, taken as literal leading phrases of
//     the subject-stripped names, only when the subject holds at least five
//     cases and two to four such phrases cover three or more cases each;
//   * a case whose name does not begin with the subject keeps its name verbatim
//     (the documented fallback).
//
// Usage:
//   node tools/propose-taxonomy.mjs <names.txt> <paths.txt>

import { readFileSync } from 'node:fs';

const [, , namesPath, pathsPath] = process.argv;

const byFile = new Map();
for (const line of readFileSync(namesPath, 'utf8').trimEnd().split('\n')) {
    const tab = line.indexOf('\t');
    const file = line.slice(0, tab);
    const name = line.slice(tab + 1);
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(name);
}

const wanted = new Set(readFileSync(pathsPath, 'utf8').trim().split('\n'));

const words = (text) => text.split(' ');

/** Leading phrases of `text` with 1..max words, excluding the whole text. */
function leadingPhrases(text, max = 6) {
    const parts = words(text);
    const out = [];
    for (let count = 1; count <= Math.min(max, parts.length - 1); count += 1) {
        out.push(parts.slice(0, count).join(' '));
    }
    return out;
}

function bestSubject(names) {
    const coverage = new Map();
    for (const name of names) {
        for (const phrase of leadingPhrases(name)) {
            const entry = coverage.get(phrase) ?? { count: 0, first: names.indexOf(name) };
            entry.count += 1;
            coverage.set(phrase, entry);
        }
    }
    let best = null;
    for (const [phrase, entry] of coverage) {
        if (best === null) {
            best = { phrase, ...entry };
            continue;
        }
        if (entry.count > best.count) best = { phrase, ...entry };
        else if (entry.count === best.count) {
            const bestWords = words(best.phrase).length;
            const words_ = words(phrase).length;
            if (words_ > bestWords) best = { phrase, ...entry };
            else if (words_ === bestWords && entry.first < best.first) best = { phrase, ...entry };
        }
    }
    return best;
}

function proposeCategories(remainders) {
    const coverage = new Map();
    for (const name of remainders) {
        for (const phrase of leadingPhrases(name, 5)) {
            coverage.set(phrase, (coverage.get(phrase) ?? 0) + 1);
        }
    }
    const usable = [...coverage.entries()]
        .filter(([, count]) => count >= 3)
        .sort((left, right) => {
            if (right[1] !== left[1]) return right[1] - left[1];
            return words(right[0]).length - words(left[0]).length;
        });
    const chosen = [];
    const assigned = new Map();
    for (const [phrase] of usable) {
        if (chosen.length >= 4) break;
        if (chosen.some((existing) => existing.startsWith(`${phrase} `) || phrase.startsWith(`${existing} `))) {
            continue;
        }
        const members = remainders.filter((name, position) => !assigned.has(position) && name.startsWith(`${phrase} `));
        if (members.length < 3) continue;
        chosen.push(phrase);
        remainders.forEach((name, position) => {
            if (!assigned.has(position) && name.startsWith(`${phrase} `)) assigned.set(position, phrase);
        });
    }
    return { chosen, assigned };
}

for (const file of wanted) {
    const names = byFile.get(file);
    if (!names) {
        console.log(`### ${file}\n  MISSING FROM REPORT`);
        continue;
    }
    const subject = bestSubject(names);
    const remainders = names.map((name) =>
        name.startsWith(`${subject.phrase} `) ? name.slice(subject.phrase.length + 1) : name,
    );
    const stripped = names.filter((name) => name.startsWith(`${subject.phrase} `)).length;
    console.log(`### ${file}  (${names.length} cases)`);
    console.log(
        `  subject: ${JSON.stringify(subject.phrase)}  matches ${stripped}/${names.length}  ` +
            `${stripped === names.length ? '(byte-exact for every case)' : '(fallback cases keep their name)'}`,
    );
    const { chosen, assigned } = proposeCategories(remainders);
    if (names.length >= 5 && chosen.length >= 2) {
        console.log(`  categories: ${chosen.map((phrase) => JSON.stringify(phrase)).join(', ')}`);
    } else {
        console.log(`  categories: none (subject has ${names.length} cases, ${chosen.length} usable category)`);
    }
    names.forEach((name, position) => {
        const category = assigned.get(position);
        const remainder = category ? remainders[position].slice(category.length + 1) : remainders[position];
        const tag = category ? `[${category}] ` : '';
        console.log(`    - ${tag}${JSON.stringify(remainder)}`);
    });
}
