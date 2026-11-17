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
const excludedDirectories = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    'build-app',
    'gen',
    'target',
    'coverage',
    'data',
    '.pnpm-store'
]);
// Tool, build, and cache directories keep machine-written Markdown that is not
// repository documentation. Skip hidden directories at any depth except the
// two that hold project content.
const includedHiddenDirectories = new Set(['.agents', '.github']);
const markdownLinkPattern = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const forbiddenDatePattern = /\b20[0-9]{2}-(?:0[1-9]|1[0-2])-(?:[0-2][0-9]|3[01])\b/;
const forbiddenDirectories = new Set(['archive', 'evidence', 'screenshots']);

function relative(absolutePath) {
    return path.relative(projectRoot, absolutePath).split(path.sep).join('/') || '.';
}

function findDocuments(directory, documents = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (excludedDirectories.has(entry.name)) continue;
            if (entry.name.startsWith('.') && !includedHiddenDirectories.has(entry.name)) continue;
            findDocuments(entryPath, documents);
            continue;
        }
        if (!entry.isFile() && !entry.isSymbolicLink()) continue;
        if (entry.name.endsWith('.md') || entry.name === '.rules') {
            documents.push({ path: entryPath, symbolicLink: entry.isSymbolicLink() });
        }
    }
    return documents;
}

function readDocument(document) {
    try {
        return fs.readFileSync(document.path, 'utf8');
    } catch (error) {
        if (document.symbolicLink) return null;
        throw error;
    }
}

function resolveMarkdownLink(documentPath, rawTarget) {
    let target = rawTarget;
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    target = target.split('#', 1)[0].split('?', 1)[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) {
        return null;
    }
    return target.startsWith('/')
        ? path.join(projectRoot, target)
        : path.resolve(path.dirname(documentPath), target);
}

const failures = [];
const repositoryDocuments = findDocuments(projectRoot);
const docsDocuments = repositoryDocuments.filter((document) => {
    if (!document.path.endsWith('.md')) return false;
    const relativeToDocs = path.relative(docsRoot, document.path);
    return relativeToDocs !== '' && !relativeToDocs.startsWith('..') && !path.isAbsolute(relativeToDocs);
});
const documents = docsDocuments.map((document) => document.path);

for (const entry of fs.readdirSync(docsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && forbiddenDirectories.has(entry.name)) {
        failures.push(`docs/${entry.name}/: one-off archives and evidence do not belong in long-lived docs`);
    }
}

for (const document of docsDocuments) {
    const relativePath = relative(document.path);
    const content = readDocument(document);
    if (content === null) {
        failures.push(`${relativePath}: documentation file is unreadable (dangling symbolic link?)`);
        continue;
    }
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
    if (forbiddenDatePattern.test(content)) {
        failures.push(`${relativePath}: date-specific snapshots and execution records do not belong in docs`);
    }
    for (const oldPath of oldPaths) {
        if (content.includes(oldPath)) {
            failures.push(`${relativePath}: stale path/reference ${oldPath}`);
        }
    }
}

for (const document of repositoryDocuments) {
    const content = readDocument(document);
    if (content === null) continue;
    for (const match of content.matchAll(markdownLinkPattern)) {
        const resolved = resolveMarkdownLink(document.path, match[1]);
        if (resolved && !fs.existsSync(resolved)) {
            failures.push(`${relative(document.path)}: broken relative link ${match[1]}`);
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
    const otherMarkdownCount = repositoryDocuments.filter((document) => document.path.endsWith('.md')).length - documents.length;
    const ruleCount = repositoryDocuments.filter((document) => path.basename(document.path) === '.rules').length;
    console.log(`Documentation rules passed: ${documents.length} Markdown files use the taxonomy, metadata, and valid internal links; repository-wide relative links checked in ${otherMarkdownCount} other Markdown files and ${ruleCount} .rules files`);
}
