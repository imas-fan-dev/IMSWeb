'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { buildManifest, mergeManifests } = require('../../scripts/migration/r2-manifest');
const {
    executeExactScopeCleanup,
    main,
    planExactScopeCleanup,
    transferManifest,
    verifyTransferredManifest
} = require('../../scripts/migration/r2-transfer');
const {
    canonicalQuery,
    CloudflareRemoteTransport,
    FixtureTransferTransport,
    loadRemoteCredentials
} = require('../../scripts/migration/r2-transfer-transports');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TRANSFER_SCRIPT = path.join(PROJECT_ROOT, 'scripts/migration/r2-transfer.js');

function pngFixture(suffix = []) {
    return Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
        ...suffix
    ]);
}

function setupFixture(label) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `ims-r2-transfer-${label}-`));
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    fs.mkdirSync(path.join(source, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(source, 'one.png'), pngFixture());
    fs.writeFileSync(path.join(source, 'nested', 'two.png'), pngFixture([4]));
    const result = buildManifest(source, { runId: `${label}-run` });
    assert.deepEqual(result.errors, []);
    return { root, source, target, manifest: result.manifest };
}

function writeFormalManifest(root, manifest, label, options = {}) {
    const reportPath = path.join(root, `${label}-audit.json`);
    const report = {
        migration_ready: true,
        run_id: manifest.runId,
        source_proof: { files: {}, directories: {} },
        compensation: { disposition: null },
        ...(options.report || {})
    };
    const reportBody = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(reportPath, reportBody);
    const manifestPath = path.join(root, `${label}-manifest.json`);
    const document = {
        manifest,
        errors: [],
        auditGate: {
            version: 1,
            runId: manifest.runId,
            migrationReady: true,
            report: reportPath,
            sha256: crypto.createHash('sha256').update(reportBody).digest('hex'),
            sourceProof: report.source_proof,
            compensationDisposition: report.compensation.disposition,
            ...options.gate
        }
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
    return { document, manifestPath, reportPath };
}

async function assertRemoteGateRejected({
    fixture,
    manifestPath,
    expected,
    auditReportReadOptions,
    destructive = false
}) {
    let credentialLoads = 0;
    let transportCreations = 0;
    const arguments_ = destructive
        ? [
            'transfer', '--manifest', manifestPath, '--source-root', fixture.source,
            '--apply', '--remote', '--confirm-run-id', fixture.manifest.runId,
            '--prune-exact-scopes', '--confirm-prune-run-id', fixture.manifest.runId
        ]
        : [
            'verify', '--manifest', manifestPath, '--remote',
            '--confirm-run-id', fixture.manifest.runId, '--bucket-exact'
        ];
    await assert.rejects(
        main(arguments_, {
            auditReportReadOptions,
            loadRemoteCredentials() {
                credentialLoads += 1;
                return {};
            },
            createRemoteTransport() {
                transportCreations += 1;
                throw new Error('remote transport must not be created');
            }
        }),
        expected
    );
    assert.equal(credentialLoads, 0, 'invalid audit gate must fail before credential loading');
    assert.equal(transportCreations, 0, 'invalid audit gate must fail before remote transport creation');
}

test('[R2-02] dry-run validates every source without creating a target', async () => {
    const fixture = setupFixture('dry');
    try {
        const report = await transferManifest({
            manifest: fixture.manifest,
            sourceRoot: fixture.source,
            dryRun: true
        });
        assert.equal(report.mode, 'dry-run');
        assert.equal(report.objects, 2);
        assert.equal(report.bytes, fixture.manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0));
        assert.equal(fs.existsSync(fixture.target), false);

        fs.appendFileSync(path.join(fixture.source, fixture.manifest.entries[0].oldPath), 'changed');
        await assert.rejects(
            transferManifest({ manifest: fixture.manifest, sourceRoot: fixture.source, dryRun: true }),
            /differs from manifest/
        );
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('[R2-02] fixture apply submits checksums, writes object_index and fully verifies', async () => {
    const fixture = setupFixture('apply');
    const transport = new FixtureTransferTransport(fixture.target);
    try {
        const result = await transferManifest({
            manifest: fixture.manifest,
            sourceRoot: fixture.source,
            transport,
            dryRun: false
        });
        assert.equal(result.mode, 'apply');
        assert.equal(result.uploaded, 2);
        assert.equal(result.verification.fullyReadObjects, 2);
        assert.deepEqual(result.verification.differences, []);

        const rows = await transport.listIndex();
        assert.deepEqual(rows.map((row) => row.logicalKey), ['nested/two.png', 'one.png']);
        for (const entry of fixture.manifest.entries) {
            const object = await transport.getObject(entry.objectKey);
            assert.equal(object.checksumSha256, entry.sha256);
            assert.equal(object.contentType, entry.mime);
            assert.equal(crypto.createHash('sha256').update(object.body).digest('hex'), entry.sha256);
        }

        const repeated = await transferManifest({
            manifest: fixture.manifest,
            sourceRoot: fixture.source,
            transport,
            dryRun: false
        });
        assert.deepEqual(repeated.verification.differences, []);
        assert.equal((await transport.listObjects('objects/')).length, 2);
        assert.equal((await transport.listIndex()).length, 2);
    } finally {
        await transport.close();
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('[R2-02] merged manifests preserve distinct roots and logical prefixes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-merge-'));
    const news = path.join(root, 'news');
    const events = path.join(root, 'events');
    const target = path.join(root, 'target');
    fs.mkdirSync(news);
    fs.mkdirSync(events);
    fs.writeFileSync(path.join(news, 'shared.png'), pngFixture());
    fs.writeFileSync(path.join(events, 'shared.png'), pngFixture());
    const newsManifest = buildManifest(news, {
        runId: 'merge-run', logicalPrefix: 'uploads/news/original'
    });
    const eventManifest = buildManifest(events, {
        runId: 'merge-run', logicalPrefix: 'uploads/event/original'
    });
    const manifest = mergeManifests([newsManifest, eventManifest]);
    const transport = new FixtureTransferTransport(target);
    try {
        assert.equal(manifest.sourceRoot, null);
        assert.deepEqual(manifest.scopes, [
            'uploads/event/original',
            'uploads/news/original'
        ]);
        assert.equal(new Set(manifest.entries.map((entry) => entry.sourceRoot)).size, 2);
        assert.equal(new Set(manifest.entries.map((entry) => entry.objectKey)).size, 2);
        const result = await transferManifest({ manifest, transport, dryRun: false });
        assert.deepEqual(result.verification.differences, []);
        assert.deepEqual((await transport.listIndex()).map((row) => row.logicalKey), [
            'uploads/event/original/shared.png',
            'uploads/news/original/shared.png'
        ]);
    } finally {
        await transport.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[R2-02] exact transfer converges A to B idempotently and preserves other scopes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-exact-a-b-'));
    const sourceA = path.join(root, 'source-a');
    const sourceB = path.join(root, 'source-b');
    const target = path.join(root, 'target');
    fs.mkdirSync(sourceA);
    fs.mkdirSync(sourceB);
    fs.writeFileSync(path.join(sourceA, 'old-only.png'), pngFixture([1]));
    fs.writeFileSync(path.join(sourceA, 'replaced.png'), pngFixture([2]));
    fs.writeFileSync(path.join(sourceB, 'new-only.png'), pngFixture([3]));
    fs.writeFileSync(path.join(sourceB, 'replaced.png'), pngFixture([4]));
    const manifestA = buildManifest(sourceA, { runId: 'exact-a', logicalPrefix: 'uploads/news' }).manifest;
    const manifestB = buildManifest(sourceB, { runId: 'exact-b', logicalPrefix: 'uploads/news' }).manifest;
    const transport = new FixtureTransferTransport(target);
    try {
        await transferManifest({ manifest: manifestA, sourceRoot: sourceA, transport, dryRun: false });
        const crossScopeBody = Buffer.from('cross-scope');
        const crossScopeDigest = crypto.createHash('sha256').update(crossScopeBody).digest('hex');
        await transport.putObject({
            key: 'objects/cross-scope',
            body: crossScopeBody,
            checksumSha256: crossScopeDigest,
            contentType: 'application/octet-stream',
            metadata: { 'migration-run-id': 'events-run', 'logical-key': 'uploads/events/keep.bin' }
        });
        await transport.upsertIndex({
            logicalKey: 'uploads/events/keep.bin', objectId: 'cross-scope', state: 'ready',
            byteSize: crossScopeBody.length, contentType: 'application/octet-stream',
            sha256: crossScopeDigest, etag: null
        });

        const firstB = await transferManifest({
            manifest: manifestB,
            sourceRoot: sourceB,
            transport,
            dryRun: false,
            pruneExactScopes: true
        });
        const oldObjectKeys = manifestA.entries
            .map((entry) => entry.objectKey)
            .filter((key) => !manifestB.entries.some((entry) => entry.objectKey === key));
        assert.deepEqual(new Set(firstB.cleanup.deletedObjects), new Set(oldObjectKeys));
        assert.ok(firstB.cleanup.objectCandidates.every((candidate) =>
            candidate.evidence.some((evidence) => evidence.kind === 'superseded-index')
        ));
        assert.deepEqual(firstB.cleanup.deletedIndexes, ['uploads/news/old-only.png']);
        for (const key of oldObjectKeys) assert.equal(await transport.headObject(key), null);
        assert.ok(await transport.headObject('objects/cross-scope'));
        assert.deepEqual((await transport.listIndex()).map((row) => row.logicalKey), [
            'uploads/events/keep.bin',
            'uploads/news/new-only.png',
            'uploads/news/replaced.png'
        ]);

        const repeatedB = await transferManifest({
            manifest: manifestB,
            sourceRoot: sourceB,
            transport,
            dryRun: false,
            pruneExactScopes: true
        });
        assert.deepEqual(repeatedB.cleanup.objectCandidates, []);
        assert.deepEqual(repeatedB.cleanup.deletedIndexes, []);
        assert.deepEqual(repeatedB.verification.differences, []);
        assert.ok(await transport.headObject('objects/cross-scope'));
    } finally {
        await transport.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[R2-02] exact cleanup never deletes an objectId shared by an active cross-scope key', async () => {
    const manifest = {
        version: 1,
        runId: 'shared-safe',
        scopes: ['uploads/news'],
        entries: []
    };
    const stale = {
        logicalKey: 'uploads/news/stale.bin', objectId: 'shared-object', state: 'ready',
        byteSize: 1, contentType: 'application/octet-stream', sha256: '1'.repeat(64), etag: null
    };
    const crossScope = {
        ...stale,
        logicalKey: 'uploads/events/live.bin'
    };
    const deletedObjects = [];
    const deletedIndexes = [];
    const transport = {
        async listObjects() { return [{ key: 'objects/shared-object', size: 1 }]; },
        async listIndex() { return [stale, crossScope]; },
        async headObject() { return { metadata: {} }; },
        async deleteObject(key) { deletedObjects.push(key); },
        async deleteIndexIfMatches(row) { deletedIndexes.push(row.logicalKey); return true; }
    };
    const plan = await planExactScopeCleanup(manifest, transport, [stale, crossScope]);
    const report = await executeExactScopeCleanup(plan, manifest, transport);
    assert.deepEqual(deletedObjects, []);
    assert.deepEqual(deletedIndexes, ['uploads/news/stale.bin']);
    assert.deepEqual(report.retainedObjects, [{
        objectKey: 'objects/shared-object',
        reason: 'active-reference',
        logicalKeys: ['uploads/events/live.bin']
    }]);
});

test('[R2-02] scoped verification ignores other scopes and rejects extras inside its prefix', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-scoped-'));
    const news = path.join(root, 'news');
    const events = path.join(root, 'events');
    const target = path.join(root, 'target');
    fs.mkdirSync(news);
    fs.mkdirSync(events);
    fs.writeFileSync(path.join(news, 'one.png'), pngFixture());
    fs.writeFileSync(path.join(events, 'two.png'), pngFixture([4]));
    const manifest = mergeManifests([
        buildManifest(news, { runId: 'scoped-run', logicalPrefix: 'uploads/news' }),
        buildManifest(events, { runId: 'scoped-run', logicalPrefix: 'uploads/events' })
    ]);
    const transport = new FixtureTransferTransport(target);
    try {
        await transferManifest({ manifest, transport, dryRun: false });

        const otherBody = Buffer.from('other-scope-extra');
        const otherDigest = crypto.createHash('sha256').update(otherBody).digest('hex');
        await transport.putObject({
            key: 'objects/other-scope-extra', body: otherBody,
            checksumSha256: otherDigest, contentType: 'application/octet-stream'
        });
        await transport.upsertIndex({
            logicalKey: 'uploads/events/unexpected.bin', objectId: 'other-scope-extra',
            state: 'ready', byteSize: otherBody.length,
            contentType: 'application/octet-stream', sha256: otherDigest, etag: null
        });

        const newsOnly = await verifyTransferredManifest(manifest, transport, ['uploads/news']);
        assert.deepEqual(newsOnly.differences, []);
        assert.equal(newsOnly.acceptanceMode, 'scope-exact');
        assert.equal(newsOnly.physicalCoverage, 'indexed-associations');
        assert.equal(newsOnly.expectedObjects, 1);
        assert.equal(newsOnly.globalListedObjects, 3);

        const orphanBody = Buffer.from('unindexed-orphan');
        const orphanDigest = crypto.createHash('sha256').update(orphanBody).digest('hex');
        await transport.putObject({
            key: 'objects/unindexed-orphan', body: orphanBody,
            checksumSha256: orphanDigest, contentType: 'application/octet-stream'
        });
        const bucketExact = await verifyTransferredManifest(manifest, transport, undefined, { bucketExact: true });
        assert.equal(bucketExact.acceptanceMode, 'bucket-exact');
        assert.equal(bucketExact.physicalCoverage, 'full-bucket');
        assert.ok(bucketExact.differences.some((difference) =>
            difference.kind === 'extra-object' && difference.key === 'objects/unindexed-orphan'
        ));

        const scopedBody = Buffer.from('selected-scope-extra');
        const scopedDigest = crypto.createHash('sha256').update(scopedBody).digest('hex');
        await transport.putObject({
            key: 'objects/selected-scope-extra', body: scopedBody,
            checksumSha256: scopedDigest, contentType: 'application/octet-stream'
        });
        await transport.upsertIndex({
            logicalKey: 'uploads/news/unexpected.bin', objectId: 'selected-scope-extra',
            state: 'ready', byteSize: scopedBody.length,
            contentType: 'application/octet-stream', sha256: scopedDigest, etag: null
        });

        const report = await verifyTransferredManifest(manifest, transport, ['uploads/news']);
        assert.deepEqual(
            new Set(report.differences.map((difference) => difference.kind)),
            new Set(['extra-object', 'extra-index'])
        );
        await assert.rejects(
            verifyTransferredManifest(manifest, transport, ['not-declared']),
            /not declared by manifest/
        );
    } finally {
        await transport.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[R2-02] full verification reports missing, extra and mismatched objects/index rows', async () => {
    const fixture = setupFixture('differences');
    const transport = new FixtureTransferTransport(fixture.target);
    try {
        await transferManifest({
            manifest: fixture.manifest,
            sourceRoot: fixture.source,
            transport,
            dryRun: false
        });
        const [missing, changed] = fixture.manifest.entries;
        await transport.deleteObject(missing.objectKey);
        fs.appendFileSync(path.join(transport.objectsRoot, ...changed.objectKey.split('/')), 'corrupt');

        const extraBody = Buffer.from('extra object');
        const extraDigest = crypto.createHash('sha256').update(extraBody).digest('hex');
        await transport.putObject({
            key: 'objects/extra-object',
            body: extraBody,
            checksumSha256: extraDigest,
            contentType: 'application/octet-stream'
        });
        await transport.upsertIndex({
            logicalKey: 'extra/logical-key',
            objectId: 'extra-index-object',
            state: 'ready',
            byteSize: 1,
            contentType: 'application/octet-stream',
            sha256: '0'.repeat(64),
            etag: null
        });
        const changedRow = (await transport.listIndex()).find((row) => row.logicalKey === changed.oldPath);
        await transport.upsertIndex({ ...changedRow, state: 'pending' });

        const report = await verifyTransferredManifest(fixture.manifest, transport);
        const kinds = new Set(report.differences.map((difference) => difference.kind));
        for (const expected of [
            'missing-object', 'extra-object', 'extra-index', 'object-mismatch', 'index-mismatch'
        ]) assert.ok(kinds.has(expected), `missing ${expected}: ${JSON.stringify(report.differences)}`);
        assert.equal(report.fullyReadObjects, 1);
    } finally {
        await transport.close();
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('[R2-02] CLI defaults to dry-run and requires explicit remote safety gates', () => {
    const fixture = setupFixture('cli');
    const manifestPath = path.join(fixture.root, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ manifest: fixture.manifest, errors: [] })}\n`);
    const formalManifest = writeFormalManifest(fixture.root, fixture.manifest, 'cli-formal');
    try {
        const dryRun = spawnSync(process.execPath, [
            TRANSFER_SCRIPT, 'transfer', '--manifest', manifestPath, '--source-root', fixture.source
        ], { encoding: 'utf8' });
        assert.equal(dryRun.status, 0, dryRun.stderr);
        assert.equal(JSON.parse(dryRun.stdout).mode, 'dry-run');

        const unsafeRemote = spawnSync(process.execPath, [
            TRANSFER_SCRIPT, 'transfer', '--manifest', formalManifest.manifestPath,
            '--source-root', fixture.source, '--apply', '--remote'
        ], { encoding: 'utf8' });
        assert.equal(unsafeRemote.status, 1);
        assert.match(unsafeRemote.stderr, /confirm-run-id/);

        const fixtureApply = spawnSync(process.execPath, [
            TRANSFER_SCRIPT, 'transfer', '--manifest', manifestPath,
            '--source-root', fixture.source, '--apply', '--fixture-dir', fixture.target
        ], { encoding: 'utf8' });
        assert.equal(fixtureApply.status, 0, fixtureApply.stderr);
        assert.equal(JSON.parse(fixtureApply.stdout).verification.differences.length, 0);

        const unconfirmedPrune = spawnSync(process.execPath, [
            TRANSFER_SCRIPT, 'transfer', '--manifest', manifestPath,
            '--source-root', fixture.source, '--apply', '--fixture-dir', fixture.target,
            '--prune-exact-scopes'
        ], { encoding: 'utf8' });
        assert.equal(unconfirmedPrune.status, 1);
        assert.match(unconfirmedPrune.stderr, /confirm-prune-run-id/);

        const pruneReport = path.join(fixture.root, 'prune-report.json');
        const confirmedPrune = spawnSync(process.execPath, [
            TRANSFER_SCRIPT, 'transfer', '--manifest', manifestPath,
            '--source-root', fixture.source, '--apply', '--fixture-dir', fixture.target,
            '--prune-exact-scopes', '--confirm-prune-run-id', fixture.manifest.runId,
            '--report', pruneReport
        ], { encoding: 'utf8' });
        assert.equal(confirmedPrune.status, 0, confirmedPrune.stderr);
        assert.equal(JSON.parse(confirmedPrune.stdout).cleanup.mode, 'exact-scope-prune');
        assert.deepEqual(JSON.parse(fs.readFileSync(pruneReport, 'utf8')).cleanup.failures, []);

        const fixtureVerify = spawnSync(process.execPath, [
            TRANSFER_SCRIPT, 'verify', '--manifest', manifestPath, '--fixture-dir', fixture.target,
            '--scope', '*'
        ], { encoding: 'utf8' });
        assert.equal(fixtureVerify.status, 0, fixtureVerify.stderr);
        assert.equal(JSON.parse(fixtureVerify.stdout).fullyReadObjects, 2);

        const bucketVerify = spawnSync(process.execPath, [
            TRANSFER_SCRIPT, 'verify', '--manifest', manifestPath, '--fixture-dir', fixture.target,
            '--bucket-exact'
        ], { encoding: 'utf8' });
        assert.equal(bucketVerify.status, 0, bucketVerify.stderr);
        assert.equal(JSON.parse(bucketVerify.stdout).acceptanceMode, 'bucket-exact');

        const ambiguousVerify = spawnSync(process.execPath, [
            TRANSFER_SCRIPT, 'verify', '--manifest', manifestPath, '--fixture-dir', fixture.target,
            '--bucket-exact', '--scope', '*'
        ], { encoding: 'utf8' });
        assert.equal(ambiguousVerify.status, 1);
        assert.match(ambiguousVerify.stderr, /cannot be combined/);
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('[R2-02] invalid formal audit gates fail before any remote setup or request', async () => {
    const fixture = setupFixture('remote-gate');
    try {
        const plainManifest = path.join(fixture.root, 'plain-manifest.json');
        fs.writeFileSync(plainManifest, `${JSON.stringify(fixture.manifest)}\n`);
        await assertRemoteGateRejected({
            fixture,
            manifestPath: plainManifest,
            expected: /formal manifest envelope/,
            destructive: true
        });

        const missingGate = path.join(fixture.root, 'missing-gate.json');
        fs.writeFileSync(missingGate, `${JSON.stringify({ manifest: fixture.manifest, errors: [] })}\n`);
        await assertRemoteGateRejected({
            fixture,
            manifestPath: missingGate,
            expected: /requires formal manifest auditGate/
        });

        const badDigest = writeFormalManifest(fixture.root, fixture.manifest, 'bad-digest', {
            gate: { sha256: '0'.repeat(64) }
        });
        await assertRemoteGateRejected({
            fixture,
            manifestPath: badDigest.manifestPath,
            expected: /audit report SHA-256 mismatch/
        });

        const changedReport = writeFormalManifest(fixture.root, fixture.manifest, 'changed-report');
        await assertRemoteGateRejected({
            fixture,
            manifestPath: changedReport.manifestPath,
            expected: /changed during stable read/,
            auditReportReadOptions: {
                afterRead(file) {
                    fs.appendFileSync(file, ' ');
                }
            }
        });

        const gateNotReady = writeFormalManifest(fixture.root, fixture.manifest, 'gate-not-ready', {
            gate: { migrationReady: false }
        });
        await assertRemoteGateRejected({
            fixture,
            manifestPath: gateNotReady.manifestPath,
            expected: /auditGate\.migrationReady must be true/
        });

        const reportNotReady = writeFormalManifest(fixture.root, fixture.manifest, 'report-not-ready', {
            report: { migration_ready: false, run_id: fixture.manifest.runId }
        });
        await assertRemoteGateRejected({
            fixture,
            manifestPath: reportNotReady.manifestPath,
            expected: /audit report migration_ready must be true/
        });

        const gateRunMismatch = writeFormalManifest(fixture.root, fixture.manifest, 'gate-run-mismatch', {
            gate: { runId: 'different-run' }
        });
        await assertRemoteGateRejected({
            fixture,
            manifestPath: gateRunMismatch.manifestPath,
            expected: /auditGate runId must match manifest runId/
        });

        const reportRunMismatch = writeFormalManifest(fixture.root, fixture.manifest, 'report-run-mismatch', {
            report: { migration_ready: true, run_id: 'different-run' }
        });
        await assertRemoteGateRejected({
            fixture,
            manifestPath: reportRunMismatch.manifestPath,
            expected: /audit report run_id must match auditGate runId/
        });

        const sourceProofMismatch = writeFormalManifest(fixture.root, fixture.manifest, 'proof-mismatch', {
            gate: { sourceProof: { files: { forged: {} }, directories: {} } }
        });
        await assertRemoteGateRejected({
            fixture,
            manifestPath: sourceProofMismatch.manifestPath,
            expected: /sourceProof must match audit report source_proof/
        });

        const dispositionMismatch = writeFormalManifest(fixture.root, fixture.manifest, 'disposition-mismatch', {
            gate: { compensationDisposition: { action: 'forged' } }
        });
        await assertRemoteGateRejected({
            fixture,
            manifestPath: dispositionMismatch.manifestPath,
            expected: /compensationDisposition must match audit report disposition/
        });
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('[R2-02] remote transport sends S3 SHA-256 checksum and prepared D1 mapping', async () => {
    const calls = [];
    const checksum = crypto.createHash('sha256').update('remote').digest('hex');
    const fakeFetch = async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).includes('/d1/database/')) {
            const query = JSON.parse(init.body);
            return new Response(JSON.stringify({
                success: true,
                errors: [],
                result: [{
                    success: true,
                    results: query.sql.includes('DELETE FROM object_index')
                        ? [{ logicalKey: 'legacy/path' }]
                        : []
                }]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('', {
            status: 200,
            headers: {
                ETag: '"remote-etag"',
                'x-amz-checksum-sha256': Buffer.from(checksum, 'hex').toString('base64'),
                'x-amz-meta-migration-run-id': 'fixture-run',
                'x-amz-meta-logical-key': 'uploads%2Fnews%2Flegacy.png'
            }
        });
    };
    const transport = new CloudflareRemoteTransport({
        accountId: 'account-id',
        apiToken: 'api-token',
        r2AccessKeyId: 'access-key',
        r2SecretAccessKey: 'secret-key',
        bucket: 'fixture-bucket',
        databaseId: 'database-id'
    }, {
        fetch: fakeFetch,
        now: () => new Date('2026-07-21T00:00:00.000Z')
    });

    const put = await transport.putObject({
        key: 'objects/remote-object',
        body: Buffer.from('remote'),
        checksumSha256: checksum,
        contentType: 'application/octet-stream',
        metadata: { 'migration-run-id': 'fixture-run' }
    });
    assert.equal(put.checksumSha256, checksum);
    const putCall = calls[0];
    assert.equal(putCall.init.headers['x-amz-checksum-sha256'], Buffer.from(checksum, 'hex').toString('base64'));
    assert.equal(putCall.init.headers['content-type'], 'application/octet-stream');
    assert.match(putCall.init.headers.authorization, /^AWS4-HMAC-SHA256 /);
    assert.match(putCall.init.headers.authorization, /SignedHeaders=.*x-amz-checksum-sha256/);

    await transport.upsertIndex({
        logicalKey: 'legacy/path', objectId: 'remote-object', state: 'ready', byteSize: 6,
        contentType: 'application/octet-stream', sha256: checksum, etag: put.etag
    });
    const d1Call = calls[1];
    assert.equal(d1Call.init.headers.Authorization, 'Bearer api-token');
    const query = JSON.parse(d1Call.init.body);
    assert.match(query.sql, /INSERT INTO object_index/);
    assert.deepEqual(query.params.slice(0, 3), ['legacy/path', 'remote-object', 'ready']);

    const head = await transport.headObject('objects/remote-object');
    assert.equal(head.metadata['migration-run-id'], 'fixture-run');
    assert.equal(head.metadata['logical-key'], 'uploads/news/legacy.png');
    await transport.deleteObject('objects/remote-object');
    assert.equal(calls.at(-1).init.method, 'DELETE');
    assert.equal(await transport.deleteIndexIfMatches({
        logicalKey: 'legacy/path', objectId: 'remote-object', state: 'ready', byteSize: 6,
        contentType: 'application/octet-stream', sha256: checksum, etag: put.etag
    }), true);
    const deleteQuery = JSON.parse(calls.at(-1).init.body);
    assert.match(deleteQuery.sql, /DELETE FROM object_index/);
    assert.match(deleteQuery.sql, /RETURNING logical_key/);
});

test('[R2-02] SigV4 query canonicalization sorts encoded bytes without locale rules', () => {
    const parameters = new URLSearchParams();
    parameters.append('z', 'last');
    parameters.append('a', 'lower');
    parameters.append('é', 'accent');
    parameters.append('A', 'first');
    parameters.append('a', 'Z');
    assert.equal(
        canonicalQuery(parameters),
        '%C3%A9=accent&A=first&a=Z&a=lower&z=last'
    );
});

test('[R2-02] remote credential files must be absolute, regular and private', (context) => {
    if (process.platform === 'win32') {
        context.skip('POSIX credential mode contract');
        return;
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-credentials-'));
    const credentials = path.join(root, 'credentials.json');
    fs.writeFileSync(credentials, JSON.stringify({
        accountId: 'account-id', apiToken: 'token', r2AccessKeyId: 'access',
        r2SecretAccessKey: 'secret', bucket: 'bucket', databaseId: 'database'
    }), { mode: 0o644 });
    try {
        fs.chmodSync(credentials, 0o644);
        assert.throws(() => loadRemoteCredentials(credentials), /group\/others/);
        fs.chmodSync(credentials, 0o600);
        assert.throws(() => loadRemoteCredentials(path.relative(process.cwd(), credentials)), /must be absolute/);
        assert.equal(loadRemoteCredentials(credentials).bucket, 'bucket');
        const link = path.join(root, 'credentials-link.json');
        fs.symlinkSync(credentials, link);
        assert.throws(() => loadRemoteCredentials(link), /symbolic link/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
