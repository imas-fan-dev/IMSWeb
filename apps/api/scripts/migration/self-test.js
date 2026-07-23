'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildManifest } = require('./r2-manifest');
const { reconcile } = require('./d1-reconcile');
const { transferManifest, verifyTransferredManifest } = require('./r2-transfer');
const { FixtureTransferTransport } = require('./r2-transfer-transports');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-migration-tools-'));

(async () => {
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'valid.png'), Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3
    ]));
    fs.mkdirSync(path.join(source, '.staging'));
    fs.writeFileSync(path.join(source, '.staging', 'partial.png'), 'partial');
    try {
        fs.symlinkSync(path.join(source, 'valid.png'), path.join(source, 'link.png'));
    } catch {
        // Filesystems without symlink permission still exercise work-dir rejection.
    }

    const { manifest, errors } = buildManifest(source, { runId: 'fixture-run' });
    if (manifest.entries.length !== 1 || errors.length < 1) throw new Error('R2 strict fixture audit failed');

    const transport = new FixtureTransferTransport(target);
    try {
        const transfer = await transferManifest({
            manifest,
            sourceRoot: source,
            transport,
            dryRun: false
        });
        if (transfer.verification.differences.length || transfer.verification.fullyReadObjects !== 1) {
            throw new Error('R2 fixture transfer verification failed');
        }
        const extraBody = Buffer.from('extra');
        await transport.putObject({
            key: 'objects/unexpected',
            body: extraBody,
            checksumSha256: crypto.createHash('sha256').update(extraBody).digest('hex'),
            contentType: 'application/octet-stream'
        });
        const differences = await verifyTransferredManifest(manifest, transport);
        if (!differences.differences.some((difference) => difference.kind === 'extra-object')) {
            throw new Error('R2 target-set difference was not detected');
        }
    } finally {
        await transport.close();
    }

    const fixture = { cards: [{ id: 1, status: 'approved', title: 'e\u0301' }] };
    if (reconcile(fixture, { cards: [{ title: 'é', status: 'approved', id: 1 }] }).differences.length) {
        throw new Error('D1 normalized fixture reconciliation failed');
    }
    if (!reconcile(fixture, { cards: [] }).differences.length) {
        throw new Error('D1 row-count mismatch was not detected');
    }
    process.stdout.write(
        `Migration tooling self-test passed: ${manifest.entries.length} object, ${errors.length} blockers\n`
    );
})().finally(() => fs.rmSync(root, { recursive: true, force: true })).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
