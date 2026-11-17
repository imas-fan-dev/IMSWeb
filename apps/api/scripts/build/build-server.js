

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '../..');
const distRoot = path.join(projectRoot, 'dist');
const serverOutput = path.join(distRoot, 'server');
const buildId = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
const stagingOutput = path.join(distRoot, `.server-build-${buildId}`);
const previousOutput = path.join(distRoot, `.server-previous-${buildId}`);
const typescriptEntry = require.resolve('typescript');
const tscEntry = path.resolve(path.dirname(typescriptEntry), '../bin/tsc');

const sourceAliasPrefix = '@/';
const compiledAliasPattern = /(\brequire\s*\(\s*)(['"])(@\/[^'"]+)\2(\s*\))/g;

function filesUnder(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(absolute);
        return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
    });
}

function compiledSpecifier(file, alias) {
    let target = path.join(stagingOutput, ...alias.slice(sourceAliasPrefix.length).split('/'));
    if (!fs.existsSync(`${target}.js`)) {
        if (fs.existsSync(path.join(target, 'index.js'))) {
            target = path.join(target, 'index');
        } else {
            throw new Error(`Internal source alias has no compiled target: ${alias}`);
        }
    }
    const relative = path.relative(path.dirname(file), target).split(path.sep).join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
}

function rewriteSourceAliases() {
    let replacementCount = 0;
    for (const file of filesUnder(stagingOutput)) {
        const source = fs.readFileSync(file, 'utf8');
        const rewritten = source.replace(
            compiledAliasPattern,
            (_match, open, quote, alias, close) => {
                replacementCount += 1;
                return `${open}${quote}${compiledSpecifier(file, alias)}${quote}${close}`;
            }
        );
        if (rewritten !== source) fs.writeFileSync(file, rewritten);
    }
    if (!replacementCount) throw new Error('No compiled internal source aliases were found');
}

fs.mkdirSync(distRoot, { recursive: true });

const compilation = spawnSync(
    process.execPath,
    [tscEntry, '-p', path.join(projectRoot, 'tsconfig.server.json'), '--outDir', stagingOutput],
    { cwd: projectRoot, stdio: 'inherit' }
);

if (compilation.error || compilation.status !== 0) {
    fs.rmSync(stagingOutput, { recursive: true, force: true });
    if (compilation.error) throw compilation.error;
    process.exit(compilation.status ?? 1);
}

try {
    rewriteSourceAliases();
} catch (error) {
    fs.rmSync(stagingOutput, { recursive: true, force: true });
    throw error;
}

let previousMoved = false;
try {
    if (fs.existsSync(serverOutput)) {
        fs.renameSync(serverOutput, previousOutput);
        previousMoved = true;
    }
    fs.renameSync(stagingOutput, serverOutput);
} catch (error) {
    if (!fs.existsSync(serverOutput) && previousMoved && fs.existsSync(previousOutput)) {
        fs.renameSync(previousOutput, serverOutput);
    }
    fs.rmSync(stagingOutput, { recursive: true, force: true });
    throw error;
}

try {
    fs.rmSync(previousOutput, { recursive: true, force: true });
} catch (error) {
    console.warn(`Unable to clean previous server build: ${error.message}`);
}

console.log('Built dist/server');
