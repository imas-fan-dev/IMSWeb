'use strict';

const crypto = require('node:crypto');
const { ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, PutObjectCommand,
    CopyObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const etag = (value) => String(value || '').replace(/^"|"$/g, '');
const providerEtag = (value) => /^[a-f0-9]{32}(?:-\d+)?$/i.test(etag(value));

function r2Verifier(config, clients) {
    const sourceEndpoint = new URL(config.source.endpoint);
    const targetEndpoint = new URL(config.target.endpoint);
    if (sourceEndpoint.protocol !== 'https:' || sourceEndpoint.origin !== targetEndpoint.origin ||
        !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/i.test(sourceEndpoint.hostname)) {
        throw new Error('R2 optimized sync requires the same R2 account endpoint');
    }
    const { source, target } = clients;
    const copyClient = config.copyCredentials
        ? new S3Client({ ...config.target, credentials: config.copyCredentials }) : target;
    const sourceObjects = new Map();
    const targetObjects = new Map();
    const verified = new Set();
    const timeoutMs = config.requestTimeoutMs || 30000;
    const stats = { strategy: 'r2-optimized', checked: 0, reused: 0, copied: 0,
        serverCopied: 0, bytesRelayed: 0, downloadedForVerification: 0,
        sourceListed: 0, targetListed: 0 };
    const send = (client, command) => client.send(command, { abortSignal: AbortSignal.timeout(timeoutMs) });
    const sizeMatches = (object, row) => object && object.ContentLength !== undefined &&
        BigInt(object.ContentLength) === BigInt(row.byte_size);
    const snapshotMatches = (object, row) => sizeMatches(object, row) &&
        providerEtag(row.etag) && etag(object.ETag) === etag(row.etag);
    const digestMatches = (object, row) => sizeMatches(object, row) && object.Metadata?.sha256 === row.sha256;

    async function list(client, bucket, objects) {
        let token;
        do {
            const result = await send(client, new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
            for (const item of result.Contents || []) {
                objects.set(item.Key, { ContentLength: item.Size, ETag: item.ETag });
            }
            if (result.IsTruncated && (!result.NextContinuationToken || result.NextContinuationToken === token)) {
                throw new Error('R2 listing did not advance');
            }
            token = result.IsTruncated ? result.NextContinuationToken : undefined;
        } while (token);
    }

    async function head(client, bucket, key) {
        try { return await send(client, new HeadObjectCommand({ Bucket: bucket, Key: key })); }
        catch (error) { if (error.$metadata?.httpStatusCode === 404) return null; throw error; }
    }

    async function readVerified(client, bucket, row, expectedEtag, retain = true) {
        const response = await send(client, new GetObjectCommand({ Bucket: bucket,
            Key: row.physical_key, ...(expectedEtag ? { IfMatch: expectedEtag } : {}) }));
        const hash = crypto.createHash('sha256');
        const parts = [];
        let length = 0;
        const timer = setTimeout(() => response.Body.destroy(new Error('R2 body read timed out')), timeoutMs);
        try {
            for await (const part of response.Body) {
                length += part.length;
                if (length > (config.maxBytes || 64 * 1024 * 1024)) {
                    response.Body.destroy(); throw new Error('Media exceeds configured byte limit');
                }
                hash.update(part); if (retain) parts.push(part);
            }
        } finally { clearTimeout(timer); }
        if (BigInt(length) !== BigInt(row.byte_size) || hash.digest('hex') !== row.sha256) {
            throw new Error('R2 object does not match snapshot digest');
        }
        stats.downloadedForVerification += 1;
        return { bytes: Buffer.concat(parts), metadata: response.Metadata || {}, response };
    }

    async function verifyExisting(row, object) {
        if (snapshotMatches(object, row) || digestMatches(object, row)) return;
        const metadata = await head(target, config.target.bucket, row.physical_key);
        if (!metadata) throw new Error('Destination media disappeared');
        if (snapshotMatches(metadata, row) || digestMatches(metadata, row)) return;
        // Legacy objects without reliable provider ETags/hash metadata still get
        // an actual SHA-256 check. A collision never results in an overwrite.
        await readVerified(target, config.target.bucket, row, metadata.ETag, false);
    }

    const verify = async (table, payload) => {
        if (table !== 's3_object_versions') return;
        const row = JSON.parse(payload.replace(/("byte_size"\s*:\s*)(\d+)/, '$1"$2"'));
        const signature = JSON.stringify([row.physical_key, row.sha256, row.byte_size]);
        if (verified.has(signature)) return;
        if (!row.physical_key || row.storage_scope !== 'public') throw new Error('Only ready public media is eligible');
        let existing = targetObjects.get(row.physical_key);
        if (existing) {
            await verifyExisting(row, existing); stats.reused += 1;
        } else {
            const sourceInfo = sourceObjects.get(row.physical_key);
            if (!sourceInfo) throw new Error('Source media missing from R2 inventory');
            let sourceHead = sourceInfo;
            let body;
            if (!snapshotMatches(sourceInfo, row)) {
                sourceHead = await head(source, config.source.bucket, row.physical_key);
                if (!sourceHead) throw new Error('Source media disappeared');
                if (!digestMatches(sourceHead, row) && !snapshotMatches(sourceHead, row)) {
                    body = await readVerified(source, config.source.bucket, row, sourceHead.ETag);
                }
            }
            let copied = false;
            let resultEtag;
            try {
                if (config.serverSideCopy) {
                    if (!sourceHead.ETag) throw new Error('R2 copy requires a source ETag guard');
                    const command = new CopyObjectCommand({ Bucket: config.target.bucket, Key: row.physical_key,
                        CopySource: config.source.bucket + '/' + row.physical_key.split('/').map(encodeURIComponent).join('/'),
                        CopySourceIfMatch: sourceHead.ETag, MetadataDirective: 'COPY' });
                    command.middlewareStack.add((next) => async (args) => {
                        args.request.headers['cf-copy-destination-if-none-match'] = '*';
                        return next(args);
                    }, { step: 'build', name: 'r2CopyDestinationAbsent' });
                    const result = await send(copyClient, command);
                    resultEtag = result.CopyObjectResult?.ETag;
                    stats.serverCopied += 1;
                } else {
                    body ||= await readVerified(source, config.source.bucket, row, sourceHead.ETag);
                    const result = await send(target, new PutObjectCommand({ Bucket: config.target.bucket,
                        Key: row.physical_key, Body: body.bytes, ContentType: row.content_type,
                        Metadata: { ...body.metadata, sha256: row.sha256 }, IfNoneMatch: '*' }));
                    resultEtag = result.ETag;
                    stats.bytesRelayed += body.bytes.length;
                }
                copied = true;
            } catch (error) {
                if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
            }
            existing = await head(target, config.target.bucket, row.physical_key);
            if (!existing) throw new Error('Destination media readback failed');
            if (!(copied && resultEtag && sizeMatches(existing, row) && etag(existing.ETag) === etag(resultEtag))) {
                await verifyExisting(row, existing);
            }
            targetObjects.set(row.physical_key, existing);
            if (copied) {
                await readVerified(target, config.target.bucket, row, existing.ETag, false);
                stats.copied += 1;
            } else stats.reused += 1;
        }
        verified.add(signature); stats.checked += 1;
    };
    verify.prepare = async () => {
        await Promise.all([list(source, config.source.bucket, sourceObjects), list(target, config.target.bucket, targetObjects)]);
        stats.sourceListed = sourceObjects.size; stats.targetListed = targetObjects.size;
    };
    verify.stats = stats;
    verify.destroy = () => {
        source.destroy?.(); target.destroy?.();
        if (copyClient !== target) copyClient.destroy?.();
    };
    return verify;
}

module.exports = { r2Verifier };
