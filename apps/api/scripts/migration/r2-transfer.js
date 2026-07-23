'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { detectedMime } = require('./r2-manifest');
const {
    CloudflareRemoteTransport,
    FixtureTransferTransport,
    loadRemoteCredentials
} = require('./r2-transfer-transports');

const FINAL_STATES = new Set(['pending', 'ready']);
const IMMUTABLE_OBJECT_ID = /^[A-Za-z0-9._-]{1,200}$/;

function sha256(body) {
    return crypto.createHash('sha256').update(body).digest('hex');
}

function compareUtf8(left, right) {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function normalizeContentType(value) {
    return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function normalizeScopePrefix(value) {
    const scope = String(value || '').replace(/^\/+|\/+$/g, '').normalize('NFC');
    if (value === '*' || scope === '*') return '*';
    if (
        !scope || scope.includes('\\') ||
        scope.split('/').some((part) => !part || part === '.' || part === '..')
    ) throw new Error(`Invalid migration scope: ${String(value)}`);
    return scope;
}

function keyInScope(key, scope) {
    return scope === '*' || key === scope || key.startsWith(`${scope}/`);
}

function objectKeyForId(objectId) {
    return typeof objectId === 'string' && IMMUTABLE_OBJECT_ID.test(objectId)
        ? `objects/${objectId}`
        : null;
}

function activeIndexRow(row) {
    return row.state !== 'deleted';
}

function sameIndexRow(left, right) {
    return left?.logicalKey === right?.logicalKey && left?.objectId === right?.objectId &&
        left?.state === right?.state && Number(left?.byteSize) === Number(right?.byteSize) &&
        left?.contentType === right?.contentType && left?.sha256 === right?.sha256 &&
        (left?.etag || null) === (right?.etag || null);
}

function resolveScopes(manifest, requestedScopes) {
    const scopes = requestedScopes === undefined
        ? manifest.scopes
        : [...new Set(requestedScopes.map(normalizeScopePrefix))].sort(compareUtf8);
    if (!scopes.length) throw new Error('At least one verification scope is required');
    for (const scope of scopes) {
        if (!manifest.scopes.includes(scope)) {
            throw new Error(`Requested scope is not declared by manifest: ${scope}`);
        }
    }
    return scopes;
}

function normalizeEntry(entry, manifestRunId) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('Manifest entries must be objects');
    }
    if (entry.runId !== manifestRunId) throw new Error(`Manifest run ID mismatch for ${entry.oldPath || '<unknown>'}`);
    if (typeof entry.oldPath !== 'string' || !entry.oldPath) {
        throw new Error(`Manifest oldPath must be non-empty text: ${String(entry.oldPath)}`);
    }
    const segments = entry.oldPath.split('/');
    if (
        path.posix.isAbsolute(entry.oldPath) || entry.oldPath.includes('\\') ||
        segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\0'))
    ) {
        throw new Error(`Unsafe manifest oldPath: ${entry.oldPath}`);
    }
    if (typeof entry.objectKey !== 'string' || !/^objects\/[A-Za-z0-9._-]{1,200}$/.test(entry.objectKey)) {
        throw new Error(`Invalid immutable object key: ${String(entry.objectKey)}`);
    }
    if (Buffer.byteLength(entry.objectKey, 'utf8') > 1024) {
        throw new Error(`Object key exceeds 1024 bytes: ${entry.objectKey}`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
        throw new Error(`Invalid byte count for ${entry.oldPath}`);
    }
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
        throw new Error(`Invalid SHA-256 for ${entry.oldPath}`);
    }
    const mime = normalizeContentType(entry.mime);
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) {
        throw new Error(`Invalid detected MIME for ${entry.oldPath}`);
    }
    const logicalKey = entry.logicalKey === undefined ? entry.oldPath.normalize('NFC') : entry.logicalKey;
    if (
        typeof logicalKey !== 'string' || !logicalKey || logicalKey !== logicalKey.normalize('NFC') ||
        path.posix.isAbsolute(logicalKey) || logicalKey.includes('\\') || logicalKey.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
        throw new Error(`Invalid logical key for ${entry.oldPath}`);
    }
    const objectId = entry.objectId === undefined ? entry.objectKey.slice('objects/'.length) : entry.objectId;
    if (typeof objectId !== 'string' || entry.objectKey !== `objects/${objectId}`) {
        throw new Error(`Object ID does not match object key for ${entry.oldPath}`);
    }
    const state = entry.state === undefined ? 'ready' : entry.state;
    if (!FINAL_STATES.has(state)) throw new Error(`Migration object must be pending or ready: ${entry.oldPath}`);
    const sourceRoot = entry.sourceRoot === undefined ? undefined : entry.sourceRoot;
    if (sourceRoot !== undefined && (typeof sourceRoot !== 'string' || !path.isAbsolute(sourceRoot))) {
        throw new Error(`Entry sourceRoot must be absolute: ${entry.oldPath}`);
    }
    return {
        runId: entry.runId,
        oldPath: entry.oldPath,
        logicalKey,
        objectKey: entry.objectKey,
        objectId,
        state,
        sourceRoot,
        bytes: entry.bytes,
        mime,
        sha256: entry.sha256
    };
}

function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Manifest must be an object');
    if (manifest.version !== 1) throw new Error(`Unsupported manifest version: ${String(manifest.version)}`);
    if (typeof manifest.runId !== 'string' || !manifest.runId.trim()) throw new Error('Manifest runId is required');
    if (!Array.isArray(manifest.entries)) throw new Error('Manifest entries must be an array');
    const entries = manifest.entries.map((entry) => normalizeEntry(entry, manifest.runId));
    const scopes = [...new Set((manifest.scopes || ['*']).map(normalizeScopePrefix))].sort(compareUtf8);
    if (scopes.includes('*') && scopes.length !== 1) {
        throw new Error('Global migration scope cannot be combined with narrower scopes');
    }
    for (const entry of entries) {
        if (!scopes.some((scope) => keyInScope(entry.logicalKey, scope))) {
            throw new Error(`Manifest logical key is outside declared scopes: ${entry.logicalKey}`);
        }
    }
    const identities = [
        ['source path', (entry) => `${entry.sourceRoot || manifest.sourceRoot || ''}\0${entry.oldPath}`],
        ['logical key', (entry) => entry.logicalKey],
        ['object key', (entry) => entry.objectKey],
        ['object ID', (entry) => entry.objectId]
    ];
    for (const [label, select] of identities) {
        const seen = new Set();
        for (const entry of entries) {
            const identity = select(entry);
            if (seen.has(identity)) throw new Error(`Duplicate manifest ${label}: ${identity}`);
            seen.add(identity);
        }
    }
    return {
        version: 1,
        runId: manifest.runId,
        sourceRoot: manifest.sourceRoot,
        scopes,
        entries
    };
}

function loadManifestDocument(file) {
    if (!file) throw new Error('--manifest is required');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const blockers = Array.isArray(parsed.errors) ? parsed.errors : [];
    if (blockers.length) throw new Error(`Manifest has ${blockers.length} inventory blocker(s)`);
    return {
        document: parsed,
        manifest: validateManifest(parsed.manifest || parsed)
    };
}

function loadManifest(file) {
    return loadManifestDocument(file).manifest;
}

function sameFileIdentity(left, right) {
    return ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs']
        .every((field) => left[field] === right[field]);
}

function readStableAuditReport(file, { afterRead } = {}) {
    if (typeof file !== 'string' || !path.isAbsolute(file)) {
        throw new Error('Remote auditGate.report must be an absolute path');
    }
    if (afterRead !== undefined && typeof afterRead !== 'function') {
        throw new Error('afterRead must be a function');
    }

    let beforePath;
    try {
        beforePath = fs.lstatSync(file, { bigint: true });
    } catch (error) {
        throw new Error(`Remote audit report is not readable: ${file} (${error.code || error.message})`);
    }
    if (beforePath.isSymbolicLink()) throw new Error(`Remote audit report cannot be a symbolic link: ${file}`);
    if (!beforePath.isFile()) throw new Error(`Remote audit report must be a regular file: ${file}`);

    let descriptor;
    try {
        descriptor = fs.openSync(
            file,
            fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)
        );
    } catch (error) {
        const detail = error.code === 'ELOOP' ? 'symbolic link' : (error.code || error.message);
        throw new Error(`Remote audit report could not be opened safely: ${file} (${detail})`);
    }

    try {
        const beforeDescriptor = fs.fstatSync(descriptor, { bigint: true });
        if (!beforeDescriptor.isFile() || !sameFileIdentity(beforePath, beforeDescriptor)) {
            throw new Error(`Remote audit report changed during stable read: ${file}`);
        }
        const body = fs.readFileSync(descriptor);
        if (afterRead) afterRead(file, body);

        let afterDescriptor;
        let afterPath;
        try {
            afterDescriptor = fs.fstatSync(descriptor, { bigint: true });
            afterPath = fs.lstatSync(file, { bigint: true });
        } catch {
            throw new Error(`Remote audit report changed during stable read: ${file}`);
        }
        if (
            !afterPath.isFile() || afterPath.isSymbolicLink() ||
            !sameFileIdentity(beforeDescriptor, afterDescriptor) ||
            !sameFileIdentity(beforePath, afterPath) ||
            BigInt(body.byteLength) !== beforeDescriptor.size
        ) {
            throw new Error(`Remote audit report changed during stable read: ${file}`);
        }
        return body;
    } finally {
        fs.closeSync(descriptor);
    }
}

function validateRemoteAuditGate(document, manifest, readOptions) {
    if (
        !document || typeof document !== 'object' || Array.isArray(document) ||
        !Object.prototype.hasOwnProperty.call(document, 'manifest') ||
        !Array.isArray(document.errors)
    ) {
        throw new Error('Remote mode requires a formal manifest envelope with manifest, errors, and auditGate');
    }
    const gate = document.auditGate;
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
        throw new Error('Remote mode requires formal manifest auditGate');
    }
    if (gate.version !== 1) throw new Error('Remote auditGate.version must be 1');
    if (gate.migrationReady !== true) throw new Error('Remote auditGate.migrationReady must be true');
    if (gate.runId !== manifest.runId) {
        throw new Error(`Remote auditGate runId must match manifest runId ${manifest.runId}`);
    }
    if (typeof gate.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(gate.sha256)) {
        throw new Error('Remote auditGate.sha256 must be a lowercase SHA-256 digest');
    }

    const reportBody = readStableAuditReport(gate.report, readOptions);
    const actualSha256 = sha256(reportBody);
    if (actualSha256 !== gate.sha256) {
        throw new Error(`Remote audit report SHA-256 mismatch: expected ${gate.sha256}, got ${actualSha256}`);
    }
    let report;
    try {
        report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(reportBody));
    } catch (error) {
        throw new Error(`Remote audit report must be valid UTF-8 JSON: ${error.message}`);
    }
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
        throw new Error('Remote audit report must be a JSON object');
    }
    if (report.migration_ready !== true) {
        throw new Error('Remote audit report migration_ready must be true');
    }
    if (report.run_id !== gate.runId) {
        throw new Error(`Remote audit report run_id must match auditGate runId ${gate.runId}`);
    }
    if (
        !gate.sourceProof || typeof gate.sourceProof !== 'object' || Array.isArray(gate.sourceProof) ||
        !gate.sourceProof.files || typeof gate.sourceProof.files !== 'object' ||
        !gate.sourceProof.directories || typeof gate.sourceProof.directories !== 'object'
    ) {
        throw new Error('Remote auditGate.sourceProof must contain files and directories');
    }
    if (!isDeepStrictEqual(gate.sourceProof, report.source_proof)) {
        throw new Error('Remote auditGate.sourceProof must match audit report source_proof');
    }
    if (
        !report.compensation || typeof report.compensation !== 'object' ||
        !Object.prototype.hasOwnProperty.call(report.compensation, 'disposition') ||
        !Object.prototype.hasOwnProperty.call(gate, 'compensationDisposition')
    ) {
        throw new Error('Remote formal audit evidence must include compensation disposition');
    }
    if (!isDeepStrictEqual(gate.compensationDisposition, report.compensation.disposition)) {
        throw new Error('Remote auditGate compensationDisposition must match audit report disposition');
    }
    return { report: gate.report, runId: gate.runId, sha256: actualSha256 };
}

function sourcePath(root, oldPath) {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, ...oldPath.split('/'));
    const relative = path.relative(resolvedRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Manifest source escapes root: ${oldPath}`);
    }
    return resolved;
}

async function readVerifiedSource(root, entry) {
    const effectiveRoot = entry.sourceRoot || root;
    if (!effectiveRoot) throw new Error(`Source root is missing for ${entry.oldPath}`);
    const source = sourcePath(effectiveRoot, entry.oldPath);
    const before = await fs.promises.lstat(source, { bigint: true });
    if (before.isSymbolicLink() || !before.isFile()) throw new Error(`Source is not a regular file: ${entry.oldPath}`);
    const body = await fs.promises.readFile(source);
    const after = await fs.promises.lstat(source, { bigint: true });
    if (
        before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs || BigInt(body.byteLength) !== after.size
    ) {
        throw new Error(`Source changed while reading: ${entry.oldPath}`);
    }
    const digest = sha256(body);
    const mime = detectedMime(body);
    if (body.byteLength !== entry.bytes) {
        throw new Error(`Source byte count differs from manifest: ${entry.oldPath}`);
    }
    if (digest !== entry.sha256) throw new Error(`Source SHA-256 differs from manifest: ${entry.oldPath}`);
    if (mime !== entry.mime) throw new Error(`Source MIME differs from manifest: ${entry.oldPath}`);
    return body;
}

async function preflightManifest(manifest, sourceRoot) {
    let bytes = 0;
    for (const entry of manifest.entries) {
        await readVerifiedSource(sourceRoot, entry);
        bytes += entry.bytes;
    }
    return {
        mode: 'dry-run',
        runId: manifest.runId,
        sourceRoot: sourceRoot ? path.resolve(sourceRoot) : null,
        objects: manifest.entries.length,
        bytes
    };
}

function compareExactSets(expectedValues, actualValues, missingKind, extraKind) {
    const expected = new Set(expectedValues);
    const actual = new Set(actualValues);
    const differences = [];
    for (const value of [...expected].sort(compareUtf8)) {
        if (!actual.has(value)) differences.push({ kind: missingKind, key: value });
    }
    for (const value of [...actual].sort(compareUtf8)) {
        if (!expected.has(value)) differences.push({ kind: extraKind, key: value });
    }
    return differences;
}

async function verifyTransferredManifest(manifestInput, transport, requestedScopes, options = {}) {
    const manifest = validateManifest(manifestInput);
    const bucketExact = options.bucketExact === true;
    if (bucketExact && requestedScopes !== undefined) {
        throw new Error('Bucket-exact verification cannot be combined with requested scopes');
    }
    const scopes = resolveScopes(manifest, bucketExact ? undefined : requestedScopes);
    const scopedEntries = bucketExact
        ? manifest.entries
        : manifest.entries.filter((entry) => scopes.some((scope) => keyInScope(entry.logicalKey, scope)));
    const expectedByObject = new Map(scopedEntries.map((entry) => [entry.objectKey, entry]));
    const expectedByLogical = new Map(scopedEntries.map((entry) => [entry.logicalKey, entry]));
    const [allObjects, allIndexRows] = await Promise.all([
        transport.listObjects('objects/'),
        transport.listIndex()
    ]);
    const indexRows = bucketExact
        ? allIndexRows
        : allIndexRows.filter((row) => scopes.some((scope) => keyInScope(row.logicalKey, scope)));
    const candidateObjectKeys = new Set([
        ...expectedByObject.keys(),
        ...indexRows.map((row) => `objects/${row.objectId}`)
    ]);
    const objects = bucketExact || scopes.includes('*')
        ? allObjects
        : allObjects.filter((object) => candidateObjectKeys.has(object.key));
    const differences = [
        ...compareExactSets(
            expectedByObject.keys(), objects.map((object) => object.key),
            'missing-object', 'extra-object'
        ),
        ...compareExactSets(
            expectedByLogical.keys(), indexRows.map((row) => row.logicalKey),
            'missing-index', 'extra-index'
        )
    ];

    let fullyReadObjects = 0;
    for (const entry of scopedEntries) {
        const object = await transport.getObject(entry.objectKey);
        if (!object) continue;
        fullyReadObjects += 1;
        const body = Buffer.from(object.body);
        const actual = {
            bytes: body.byteLength,
            sha256: sha256(body),
            detectedMime: detectedMime(body),
            storedMime: normalizeContentType(object.contentType),
            storedChecksum: object.checksumSha256 || null
        };
        if (
            actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256 ||
            actual.detectedMime !== entry.mime || actual.storedMime !== entry.mime ||
            (actual.storedChecksum && actual.storedChecksum !== entry.sha256)
        ) {
            differences.push({
                kind: 'object-mismatch',
                key: entry.objectKey,
                expected: { bytes: entry.bytes, sha256: entry.sha256, mime: entry.mime },
                actual
            });
        }
    }

    const indexByLogical = new Map(indexRows.map((row) => [row.logicalKey, row]));
    for (const entry of scopedEntries) {
        const row = indexByLogical.get(entry.logicalKey);
        if (!row) continue;
        const expected = {
            objectId: entry.objectId,
            state: entry.state,
            byteSize: entry.bytes,
            contentType: entry.mime,
            sha256: entry.sha256
        };
        const actual = {
            objectId: row.objectId,
            state: row.state,
            byteSize: Number(row.byteSize),
            contentType: normalizeContentType(row.contentType),
            sha256: row.sha256
        };
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            differences.push({ kind: 'index-mismatch', key: entry.logicalKey, expected, actual });
        }
    }

    return {
        runId: manifest.runId,
        acceptanceMode: bucketExact ? 'bucket-exact' : 'scope-exact',
        physicalCoverage: bucketExact || scopes.includes('*') ? 'full-bucket' : 'indexed-associations',
        scopes,
        expectedObjects: scopedEntries.length,
        listedObjects: objects.length,
        listedIndexRows: indexRows.length,
        globalListedObjects: allObjects.length,
        globalListedIndexRows: allIndexRows.length,
        fullyReadObjects,
        differences
    };
}

class TransferVerificationError extends Error {
    constructor(report) {
        super(`R2/D1 verification found ${report.differences.length} difference(s)`);
        this.name = 'TransferVerificationError';
        this.report = report;
    }
}

class ExactScopeCleanupError extends Error {
    constructor(report, cause) {
        super(`Exact-scope cleanup failed with ${report.failures.length} failure(s)`, { cause });
        this.name = 'ExactScopeCleanupError';
        this.report = report;
    }
}

async function planExactScopeCleanup(manifestInput, transport, beforeIndexRows) {
    const manifest = validateManifest(manifestInput);
    const scopes = resolveScopes(manifest);
    const expectedByLogical = new Map(manifest.entries.map((entry) => [entry.logicalKey, entry]));
    const expectedObjectKeys = new Set(manifest.entries.map((entry) => entry.objectKey));
    const affectedRows = beforeIndexRows.filter((row) => {
        if (!scopes.some((scope) => keyInScope(row.logicalKey, scope))) return false;
        const expected = expectedByLogical.get(row.logicalKey);
        return !expected || expected.objectId !== row.objectId;
    });
    const staleRows = affectedRows.filter((row) => !expectedByLogical.has(row.logicalKey));
    const affectedByLogical = new Map(affectedRows.map((row) => [row.logicalKey, row]));
    const candidates = new Map();
    const blockers = [];

    const addCandidate = (objectKey, evidence) => {
        const existing = candidates.get(objectKey) || { objectKey, evidence: [] };
        existing.evidence.push(evidence);
        candidates.set(objectKey, existing);
    };
    for (const row of affectedRows) {
        const objectKey = objectKeyForId(row.objectId);
        if (!objectKey) {
            blockers.push({ kind: 'unsafe-object-id', logicalKey: row.logicalKey, objectId: row.objectId });
            continue;
        }
        addCandidate(objectKey, { kind: 'superseded-index', logicalKey: row.logicalKey });
    }

    const [objects, currentIndexRows] = await Promise.all([
        transport.listObjects('objects/'),
        transport.listIndex()
    ]);
    const activeReferences = new Map();
    for (const row of currentIndexRows.filter(activeIndexRow)) {
        const references = activeReferences.get(row.objectId) || [];
        references.push(row);
        activeReferences.set(row.objectId, references);
    }
    const unattributedObjects = [];
    for (const object of objects) {
        if (expectedObjectKeys.has(object.key) || candidates.has(object.key)) continue;
        const objectId = object.key.startsWith('objects/') ? object.key.slice('objects/'.length) : null;
        if (!objectId || objectKeyForId(objectId) !== object.key) {
            unattributedObjects.push({ objectKey: object.key, reason: 'unsafe-object-key' });
            continue;
        }
        if ((activeReferences.get(objectId) || []).length) continue;
        const head = await transport.headObject(object.key);
        const logicalKey = head?.metadata?.['logical-key'];
        const migrationRunId = head?.metadata?.['migration-run-id'];
        if (
            typeof migrationRunId === 'string' && migrationRunId &&
            typeof logicalKey === 'string' && scopes.some((scope) => keyInScope(logicalKey, scope))
        ) {
            addCandidate(object.key, {
                kind: 'scoped-migration-orphan',
                logicalKey,
                migrationRunId
            });
        } else {
            unattributedObjects.push({
                objectKey: object.key,
                reason: migrationRunId ? 'outside-selected-scopes' : 'missing-migration-ownership'
            });
        }
    }

    return {
        mode: 'exact-scope-prune',
        runId: manifest.runId,
        scopes,
        staleIndexCandidates: staleRows,
        affectedIndexSnapshots: affectedRows,
        affectedByLogical,
        objectCandidates: [...candidates.values()].sort((left, right) =>
            compareUtf8(left.objectKey, right.objectKey)
        ),
        blockers,
        unattributedObjects: unattributedObjects.sort((left, right) =>
            compareUtf8(left.objectKey, right.objectKey)
        )
    };
}

async function executeExactScopeCleanup(plan, manifestInput, transport) {
    const manifest = validateManifest(manifestInput);
    const expectedObjectIds = new Set(manifest.entries.map((entry) => entry.objectId));
    const report = {
        mode: plan.mode,
        runId: plan.runId,
        scopes: plan.scopes,
        staleIndexCandidates: plan.staleIndexCandidates.map((row) => ({
            logicalKey: row.logicalKey, objectId: row.objectId, state: row.state
        })),
        objectCandidates: plan.objectCandidates.map((candidate) => ({
            objectKey: candidate.objectKey,
            evidence: candidate.evidence
        })),
        deletedObjects: [],
        alreadyAbsentObjects: [],
        retainedObjects: [],
        deletedIndexes: [],
        unattributedObjects: plan.unattributedObjects,
        failures: [...plan.blockers]
    };
    if (report.failures.length) throw new ExactScopeCleanupError(report);

    const currentIndexRows = await transport.listIndex();
    const currentByLogical = new Map(currentIndexRows.map((row) => [row.logicalKey, row]));
    for (const candidate of plan.objectCandidates) {
        const objectId = candidate.objectKey.slice('objects/'.length);
        if (expectedObjectIds.has(objectId)) {
            report.retainedObjects.push({ objectKey: candidate.objectKey, reason: 'expected-by-manifest' });
            continue;
        }
        const activeBlockers = currentIndexRows.filter((row) => {
            if (!activeIndexRow(row) || row.objectId !== objectId) return false;
            const affected = plan.affectedByLogical.get(row.logicalKey);
            return !affected || !sameIndexRow(affected, row);
        });
        if (activeBlockers.length) {
            report.retainedObjects.push({
                objectKey: candidate.objectKey,
                reason: 'active-reference',
                logicalKeys: activeBlockers.map((row) => row.logicalKey).sort(compareUtf8)
            });
            continue;
        }
        try {
            const before = await transport.headObject(candidate.objectKey);
            if (!before) {
                report.alreadyAbsentObjects.push(candidate.objectKey);
                continue;
            }
            await transport.deleteObject(candidate.objectKey);
            if (await transport.headObject(candidate.objectKey)) {
                throw new Error('object remained visible after delete');
            }
            report.deletedObjects.push(candidate.objectKey);
        } catch (error) {
            report.failures.push({ kind: 'object-delete-failed', key: candidate.objectKey, message: error.message });
            throw new ExactScopeCleanupError(report, error);
        }
    }

    for (const stale of plan.staleIndexCandidates) {
        if (!sameIndexRow(currentByLogical.get(stale.logicalKey), stale)) {
            report.failures.push({ kind: 'index-changed', logicalKey: stale.logicalKey });
            continue;
        }
        try {
            if (await transport.deleteIndexIfMatches(stale)) report.deletedIndexes.push(stale.logicalKey);
            else report.failures.push({ kind: 'index-delete-conflict', logicalKey: stale.logicalKey });
        } catch (error) {
            report.failures.push({ kind: 'index-delete-failed', logicalKey: stale.logicalKey, message: error.message });
        }
    }
    if (report.failures.length) throw new ExactScopeCleanupError(report);
    return report;
}

async function uploadManifestObjects(manifest, sourceRoot, transport) {
    const uploaded = new Map();
    for (const entry of manifest.entries) {
        const body = await readVerifiedSource(sourceRoot, entry);
        const result = await transport.putObject({
            key: entry.objectKey,
            body,
            checksumSha256: entry.sha256,
            contentType: entry.mime,
            metadata: {
                'migration-run-id': manifest.runId,
                'logical-key': entry.logicalKey
            }
        });
        if (result?.checksumSha256 && result.checksumSha256 !== entry.sha256) {
            throw new Error(`R2 returned a different checksum for ${entry.objectKey}`);
        }
        uploaded.set(entry.objectKey, result || {});
    }
    return uploaded;
}

async function publishManifestIndex(manifest, transport, uploaded) {
    for (const entry of manifest.entries) {
        const result = uploaded.get(entry.objectKey) || {};
        await transport.upsertIndex({
            logicalKey: entry.logicalKey,
            objectId: entry.objectId,
            state: entry.state,
            byteSize: entry.bytes,
            contentType: entry.mime,
            sha256: entry.sha256,
            etag: result.etag || null
        });
    }
}

async function transferManifest({
    manifest: manifestInput,
    sourceRoot,
    transport,
    dryRun = true,
    pruneExactScopes = false,
    bucketExact = false
}) {
    const manifest = validateManifest(manifestInput);
    if (!sourceRoot && manifest.entries.some((entry) => !entry.sourceRoot)) {
        throw new Error('A source root is required for entries without sourceRoot');
    }
    const preflight = await preflightManifest(manifest, sourceRoot);
    if (dryRun) return preflight;
    if (!transport) throw new Error('Apply mode requires an object/index transport');

    const beforeIndexRows = pruneExactScopes ? await transport.listIndex() : null;
    const uploaded = await uploadManifestObjects(manifest, sourceRoot, transport);
    let cleanup = null;
    if (pruneExactScopes) {
        const plan = await planExactScopeCleanup(manifest, transport, beforeIndexRows);
        cleanup = await executeExactScopeCleanup(plan, manifest, transport);
    }
    await publishManifestIndex(manifest, transport, uploaded);
    const verification = await verifyTransferredManifest(manifest, transport, undefined, { bucketExact });
    if (verification.differences.length) throw new TransferVerificationError(verification);
    return {
        mode: 'apply',
        runId: manifest.runId,
        uploaded: uploaded.size,
        bytes: preflight.bytes,
        cleanup,
        verification
    };
}

function parseArguments(argv) {
    const command = argv[0];
    if (!['transfer', 'verify'].includes(command)) throw new Error('First argument must be transfer or verify');
    const options = {
        command,
        apply: false,
        remote: false,
        prune_exact_scopes: false,
        bucket_exact: false
    };
    const booleans = new Set(['--apply', '--remote', '--prune-exact-scopes', '--bucket-exact']);
    for (let index = 1; index < argv.length; index += 1) {
        const flag = argv[index];
        if (!flag.startsWith('--')) throw new Error(`Unexpected argument: ${flag}`);
        if (booleans.has(flag)) {
            options[flag.slice(2).replaceAll('-', '_')] = true;
            continue;
        }
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
        if (flag === '--scope') {
            if (!options.scopes) options.scopes = [];
            options.scopes.push(value);
        } else {
            options[flag.slice(2).replaceAll('-', '_')] = value;
        }
        index += 1;
    }
    return options;
}

function writeReport(file, report) {
    if (!file) return;
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

function assertRunConfirmation(manifest, options) {
    if (options.confirm_run_id !== manifest.runId) {
        throw new Error(`Remote mode requires --confirm-run-id ${manifest.runId}`);
    }
}

function assertPruneConfirmation(manifest, options) {
    if (options.confirm_prune_run_id !== manifest.runId) {
        throw new Error(`Exact-scope deletion requires --confirm-prune-run-id ${manifest.runId}`);
    }
}

async function main(argv, dependencies = {}) {
    const options = parseArguments(argv);
    const loadedManifest = loadManifestDocument(options.manifest);
    const { document, manifest } = loadedManifest;
    if (options.remote) {
        validateRemoteAuditGate(document, manifest, dependencies.auditReportReadOptions);
    }
    let transport;
    try {
        if (options.command === 'transfer' && !options.apply) {
            if (options.remote) throw new Error('Dry-run never accepts --remote; omit it to preflight locally');
            if (options.prune_exact_scopes || options.confirm_prune_run_id || options.bucket_exact) {
                throw new Error('Dry-run does not accept prune or bucket-exact flags');
            }
            const sourceRoot = options.source_root || manifest.sourceRoot;
            const report = await transferManifest({ manifest, sourceRoot, dryRun: true });
            writeReport(options.report, report);
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
            return;
        }

        if (options.remote) {
            assertRunConfirmation(manifest, options);
            const credentialsLoader = dependencies.loadRemoteCredentials || loadRemoteCredentials;
            const createRemoteTransport = dependencies.createRemoteTransport ||
                ((credentials) => new CloudflareRemoteTransport(credentials));
            transport = createRemoteTransport(credentialsLoader(options.credentials));
        } else {
            if (!options.fixture_dir) throw new Error('Local apply/verify requires --fixture-dir');
            if (options.credentials || options.confirm_run_id) {
                throw new Error('Credential and run confirmation flags are only valid with --remote');
            }
            transport = new FixtureTransferTransport(options.fixture_dir);
        }

        let report;
        if (options.command === 'transfer') {
            if (!options.apply) throw new Error('Apply mode requires --apply');
            if (options.scopes?.length) throw new Error('transfer does not accept --scope');
            if (options.prune_exact_scopes) assertPruneConfirmation(manifest, options);
            else if (options.confirm_prune_run_id) {
                throw new Error('--confirm-prune-run-id requires --prune-exact-scopes');
            }
            report = await transferManifest({
                manifest,
                sourceRoot: options.source_root || manifest.sourceRoot,
                transport,
                dryRun: false,
                pruneExactScopes: options.prune_exact_scopes,
                bucketExact: options.bucket_exact
            });
        } else {
            if (options.apply) throw new Error('verify does not accept --apply');
            if (options.prune_exact_scopes || options.confirm_prune_run_id) {
                throw new Error('verify does not accept prune flags');
            }
            if (options.bucket_exact && options.scopes?.length) {
                throw new Error('--bucket-exact cannot be combined with --scope');
            }
            if (!options.bucket_exact && !options.scopes?.length) {
                throw new Error('verify requires explicit --scope or --bucket-exact');
            }
            report = await verifyTransferredManifest(
                manifest,
                transport,
                options.bucket_exact ? undefined : options.scopes,
                { bucketExact: options.bucket_exact }
            );
            if (report.differences.length) throw new TransferVerificationError(report);
        }
        writeReport(options.report, report);
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } catch (error) {
        if (error instanceof TransferVerificationError || error instanceof ExactScopeCleanupError) {
            writeReport(options.report, error.report);
        }
        throw error;
    } finally {
        await transport?.close();
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).catch((error) => {
        if (error instanceof TransferVerificationError || error instanceof ExactScopeCleanupError) {
            process.stdout.write(`${JSON.stringify(error.report, null, 2)}\n`);
            process.exitCode = error instanceof TransferVerificationError ? 3 : 4;
            return;
        }
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    ExactScopeCleanupError,
    TransferVerificationError,
    executeExactScopeCleanup,
    loadManifest,
    loadManifestDocument,
    main,
    normalizeEntry,
    parseArguments,
    planExactScopeCleanup,
    preflightManifest,
    readVerifiedSource,
    transferManifest,
    validateManifest,
    validateRemoteAuditGate,
    verifyTransferredManifest
};
