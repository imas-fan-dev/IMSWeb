import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(projectRoot, 'docs');
const requiredMetadata = [
    /^> 文档类型：/m,
    /^> 状态：(Active|Decision)/m,
    /^> 权威来源：/m
];
const oldPaths = [
    'docs/ai-development-environment.md',
    'docs/ASSET_PROVENANCE.md',
    'docs/cache-architecture.md',
    'docs/database-architecture.md',
    'docs/database-configuration.md',
    'docs/database-table-relationships.md',
    'docs/domain-capability-architecture.md',
    'docs/fudaba-map-self-hosting.md',
    'docs/github-actions-deployment.md',
    'docs/object-storage.md',
    'docs/operations-runbook.md',
    'docs/producer-map-online-migration.md',
    'docs/wiki-management-architecture.md',
    'generate-web-contracts.mjs',
    'apps/api/src/ports/wiki-contracts.ts'
];

function markdownFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return markdownFiles(entryPath);
        return entry.name.endsWith('.md') ? [entryPath] : [];
    });
}

function resolveMarkdownLink(documentPath, rawTarget) {
    const target = rawTarget.split('#', 1)[0].split('?', 1)[0];
    if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) {
        return null;
    }
    return path.resolve(path.dirname(documentPath), target);
}

const failures = [];
const documents = markdownFiles(docsRoot);
const forbiddenDatePattern = /\b20[0-9]{2}-(?:0[1-9]|1[0-2])-(?:[0-2][0-9]|3[01])\b/;
const forbiddenDirectories = new Set(['archive', 'evidence', 'screenshots']);
for (const entry of fs.readdirSync(docsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && forbiddenDirectories.has(entry.name)) {
        failures.push(`docs/${entry.name}/: one-off archives and evidence do not belong in long-lived docs`);
    }
}
for (const documentPath of documents) {
    const relativePath = path.relative(projectRoot, documentPath);
    const content = fs.readFileSync(documentPath, 'utf8');
    const lines = content.split('\n');
    const firstContentLine = lines.find((line) => line.trim() !== '') ?? '';

    if (!firstContentLine.startsWith('# ')) {
        failures.push(`${relativePath}: first content line must be a level-one title`);
    }
    for (const pattern of requiredMetadata) {
        if (!pattern.test(content.slice(0, 1_500))) {
            failures.push(`${relativePath}: missing required metadata (${pattern})`);
        }
    }

    for (const match of content.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const resolved = resolveMarkdownLink(documentPath, match[1]);
        if (!resolved) continue;
        if (!fs.existsSync(resolved)) {
            failures.push(`${relativePath}: broken relative link ${match[1]}`);
        }
    }

    if (forbiddenDatePattern.test(content)) {
        failures.push(`${relativePath}: date-specific snapshots and execution records do not belong in docs`);
    }
    for (const oldPath of oldPaths) {
        if (content.includes(oldPath)) {
            failures.push(`${relativePath}: stale path/reference ${oldPath}`);
        }
    }
}

const rootEntries = fs.readdirSync(docsRoot, { withFileTypes: true });
const unexpectedRootMarkdown = rootEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => `docs/${entry.name}`);
if (unexpectedRootMarkdown.length) {
    failures.push(`docs/: move root-level Markdown into a taxonomy directory: ${unexpectedRootMarkdown.join(', ')}`);
}

const index = fs.readFileSync(path.join(docsRoot, 'README.md'), 'utf8');
for (const heading of ['## 文档地图', '## 文档规范', '## 自动检查']) {
    if (!index.includes(heading)) failures.push(`docs/README.md: missing ${heading}`);
}

if (failures.length) {
    console.error(`Documentation rules failed (${failures.length} issue(s)):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`Documentation rules passed: ${documents.length} Markdown files use the taxonomy, metadata, and valid internal links`);
}
