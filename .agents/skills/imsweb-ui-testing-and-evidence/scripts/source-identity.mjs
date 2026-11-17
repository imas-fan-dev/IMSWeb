import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256 } from './native-capture.mjs';

export async function snapshotSource(root) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort();
  const entries = await Promise.all(files.map(async file => ({ path: file, sha256: await fs.readFile(path.join(root, file)).then(sha256, e => { if (e.code === 'ENOENT') return null; throw e; }) })));
  const dirty = Boolean(git(['status', '--porcelain']).trim());
  return { source: { commit: git(['rev-parse', 'HEAD']).trim(), dirty, ...(dirty ? { fingerprint: sha256(JSON.stringify(entries)) } : {}) }, files: entries };
}
