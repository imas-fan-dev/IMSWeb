'use strict';

const crypto = require('node:crypto');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// Verify actual bytes rather than trusting ETag or metadata. Destination writes
// are create-only, including when another process races this one.
function verifier(config, clients = {}) {
    if (!/(^|[-_])test([-_]|$)/.test(config.target.bucket)) {
        throw new Error('Destination media bucket must contain a separate test segment');
    }
    if (config.source.endpoint === config.target.endpoint && config.source.bucket === config.target.bucket) {
        throw new Error('Source and destination media buckets must differ');
    }
    const source = clients.source || new S3Client(config.source);
    const target = clients.target || new S3Client(config.target);
    if (config.strategy === 'r2-optimized') {
        return require('./preview-r2-sync').r2Verifier(config, { source, target });
    }
    const maxBytes = config.maxBytes || 64 * 1024 * 1024;
    const verified = new Set();
    async function read(client, bucket, key) {
        try {
            const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            const parts = [];
            let length = 0;
            for await (const part of response.Body) {
                length += part.length;
                if (length > maxBytes) { response.Body.destroy(); throw new Error('Media exceeds configured byte limit'); }
                parts.push(part);
            }
            return Buffer.concat(parts);
        } catch (error) {
            if (error.$metadata?.httpStatusCode === 404) return null;
            throw error;
        }
    }
    return async (table, payload) => {
        if (table !== 's3_object_versions') return;
        // Only this metadata row is decoded; byte_size is compared using BigInt.
        // PostgreSQL bigint's textual JSON representation must remain lossless.
        const row = JSON.parse(payload.replace(/("byte_size"\s*:\s*)(\d+)/, '$1"$2"'));
        const signature = JSON.stringify([row.physical_key, row.sha256, row.byte_size]);
        if (verified.has(signature)) return;
        if (!row.physical_key || row.storage_scope !== 'public') {
            throw new Error('Only public media with explicit physical keys can be synchronized');
        }
        const existing = await read(target, config.target.bucket, row.physical_key);
        const matches = (bytes) => bytes && BigInt(bytes.length) === BigInt(row.byte_size) && sha256(bytes) === row.sha256;
        if (existing) {
            if (!matches(existing)) throw new Error('Destination media collision');
            verified.add(signature);
            return;
        }
        const bytes = await read(source, config.source.bucket, row.physical_key);
        if (!matches(bytes)) throw new Error('Source media does not match snapshot');
        try {
            await target.send(new PutObjectCommand({ Bucket: config.target.bucket, Key: row.physical_key,
                Body: bytes, ContentType: row.content_type, IfNoneMatch: '*' }));
        } catch (error) {
            if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
        }
        if (!matches(await read(target, config.target.bucket, row.physical_key))) {
            throw new Error('Destination media readback failed');
        }
        verified.add(signature);
    };
}

module.exports = { verifier };
