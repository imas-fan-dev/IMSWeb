import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Files to inspect: explicit paths when given, otherwise every changed file.
const files =
    process.argv.length > 2
        ? process.argv.slice(2)
        : execSync('git diff --name-only', { encoding: 'utf8' }).trim().split('\n');
const classes = { wrapperLines: 0, vitestImport: 0, trimmedName: 0, wrapperRetitled: 0 };
const unexpected = [];
const retitled = [];
const isWrapOpen = (l) => /^(test\.)?describe\('.*', \(\) => \{$/.test(l);
const isTestName = (l) => /^(test|it)\((['"])/.test(l);
const isVitestImport = (l) => /^import \{ [^}]*\} from 'vitest';$/.test(l);
const removedSubjects = new Set();

for (const file of files) {
    const before = execSync(`git show HEAD:${file}`, { encoding: 'utf8' }).split('\n').map((l) => l.trim());
    const after = readFileSync(file, 'utf8').split('\n').map((l) => l.trim());
    const multiset = (list) => {
        const map = new Map();
        for (const line of list) map.set(line, (map.get(line) ?? 0) + 1);
        return map;
    };
    const b = multiset(before);
    const a = multiset(after);
    const removed = [];
    const added = [];
    for (const [line, n] of b) for (let i = 0; i < n - (a.get(line) ?? 0); i += 1) removed.push(line);
    for (const [line, n] of a) for (let i = 0; i < n - (b.get(line) ?? 0); i += 1) added.push(line);

    const removedNames = removed.filter(isTestName);
    const addedNames = added.filter(isTestName);

    if (removedNames.length !== addedNames.length) {
        unexpected.push(`${file}: ${removedNames.length} name removals vs ${addedNames.length} additions`);
    }
    for (let i = 0; i < Math.min(removedNames.length, addedNames.length); i += 1) {
        const original = removedNames[i];
        const shortened = addedNames[i];
        const quote = original[5];
        const head = `test(${quote}`;
        const tail = shortened.startsWith(head) ? shortened.slice(head.length) : null;
        const rest = tail === null ? -1 : original.indexOf(tail, head.length);
        if (rest <= head.length) {
            unexpected.push(`${file}: ${shortened} is not ${original} with a leading phrase dropped`);
            continue;
        }
        const dropped = original.slice(head.length, rest);
        if (!dropped.endsWith(' ')) {
            unexpected.push(`${file}: dropped ${JSON.stringify(dropped)} does not end on a word boundary`);
            continue;
        }
        removedSubjects.add(dropped.trimEnd());
        classes.trimmedName += 1;
    }
    for (const line of removed) {
        if (line === '});') unexpected.push(`${file}: wrapper line removed: ${line}`);
        else if (isWrapOpen(line)) {
            // A suite title that changed between batches (the A2 correction of
            // the A1 subject `about` -> `about page`). Counted and printed
            // rather than silently accepted.
            classes.wrapperRetitled += 1;
            retitled.push(`${file}: ${line}`);
        } else if (isVitestImport(line)) classes.vitestImport += 1;
        else if (isTestName(line)) continue;
        else unexpected.push(`${file}: unclassified removal: ${line}`);
    }
    for (const line of added) {
        if (line === '});' || isWrapOpen(line)) classes.wrapperLines += 1;
        else if (isVitestImport(line)) classes.vitestImport += 1;
        else if (isTestName(line)) continue;
        else unexpected.push(`${file}: unclassified addition: ${line}`);
    }
}
console.log(JSON.stringify(classes, null, 2));
console.log('removed subject phrases:', JSON.stringify([...removedSubjects].sort()));
console.log(`retitled suites: ${retitled.length}`);
for (const line of retitled) console.log(`  ${line}`);
console.log(`unexpected: ${unexpected.length}`);
for (const line of unexpected) console.log(`  ${line}`);
