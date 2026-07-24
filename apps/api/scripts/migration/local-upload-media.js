'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function parseArguments(argv, environment = process.env) {
    const projectRoot = path.resolve(__dirname, '../../../..');
    const sourceRoot = environment.IMS_UPLOADS_DIR ||
        path.join(projectRoot, 'apps/legacy/data/uploads');
    const options = {
        source: path.resolve(sourceRoot),
        manifest: path.join(projectRoot, 'apps/legacy/data/upload-media-manifest.json'),
        apply: false,
        help: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        const next = () => {
            const value = argv[++index];
            if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
            return value;
        };
        if (argument === '--source') options.source = path.resolve(next());
        else if (argument === '--manifest') options.manifest = path.resolve(next());
        else if (argument === '--apply') options.apply = true;
        else if (argument === '--help' || argument === '-h') options.help = true;
        else throw new Error(`Unknown argument: ${argument}`);
    }
    options.manifest = path.resolve(options.manifest);
    return options;
}

function helpText() {
    return [
        'Usage: pnpm run media:uploads:sync -- [options]',
        '',
        'Compares mutable Legacy uploads with the configured object storage.',
        'The command is read-only unless --apply is provided.',
        '',
        'Options:',
        '  --source <directory>   Upload root (default: IMS_UPLOADS_DIR)',
        '  --manifest <file>      JSON audit report path',
        '  --apply                Write missing or changed objects, then read them back',
        '  --help                 Show this help',
        '',
        'Requires PostgreSQL and IMS_OBJECT_STORAGE=s3 with the S3/MinIO variables.'
    ].join('\n');
}

async function writeManifest(target, report) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await fs.writeFile(temporary, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        ...report
    }, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, target);
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${helpText()}\n`);
        return;
    }

    const { parseNodeObjectStorageConfig } = require('../../src/config/object-storage.ts');
    if (parseNodeObjectStorageConfig().type !== 's3') {
        throw new Error('Upload media sync requires IMS_OBJECT_STORAGE=s3');
    }
    const { syncLocalUploads } = require('../../src/utils/storage/local-upload-sync.ts');
    const { closeNodeServices, resolveNodeServices } = require('../../src/runtime/node-services.ts');
    try {
        const services = await resolveNodeServices();
        const report = await syncLocalUploads(options.source, services.storage, options.apply);
        await writeManifest(options.manifest, report);
        process.stdout.write(`${JSON.stringify({
            manifest: options.manifest,
            apply: report.apply,
            ...report.summary
        }, null, 2)}\n`);
    } finally {
        await closeNodeServices();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = { helpText, parseArguments };
