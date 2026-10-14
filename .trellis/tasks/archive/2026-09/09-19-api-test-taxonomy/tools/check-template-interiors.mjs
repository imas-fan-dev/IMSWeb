#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { scan } from './scan-test-structure.mjs';

// Template-literal interiors must be byte-identical. Suite insertion shifts line
// numbers, so the two sets are compared as *ordered sequences* of line
// contents: every template-literal line of the original file must reappear, in
// the same order and with the same bytes, in the rewritten file.
const files = process.argv.slice(2);
let checked = 0;
let changed = 0;
for (const file of files) {
  const beforeText = execSync(`git show HEAD:${file}`, { encoding: 'utf8' });
  const afterText = readFileSync(file, 'utf8');
  const before = beforeText.split('\n');
  const after = afterText.split('\n');
  const beforeSet = scan(beforeText).templateLines;
  const afterSet = scan(afterText).templateLines;
  const beforeLines = [...beforeSet].sort((a, b) => a - b).map((n) => before[n]);
  const afterLines = [...afterSet].sort((a, b) => a - b).map((n) => after[n]);
  let differences = 0;
  if (beforeLines.length !== afterLines.length) {
    differences += Math.abs(beforeLines.length - afterLines.length);
    console.log(`  !! ${file}: template-line count ${beforeLines.length} -> ${afterLines.length}`);
  }
  for (let i = 0; i < Math.min(beforeLines.length, afterLines.length); i += 1) {
    if (beforeLines[i] !== afterLines[i]) {
      differences += 1;
      if (differences < 4) console.log(`  !! ${file} seq#${i}: ${JSON.stringify(beforeLines[i])} -> ${JSON.stringify(afterLines[i])}`);
    }
  }
  checked += beforeLines.length;
  changed += differences;
  console.log(`${file}: template-literal lines=${beforeLines.length} byte-differences=${differences}`);
}
console.log(`total template lines compared=${checked}, byte-differences=${changed}`);
