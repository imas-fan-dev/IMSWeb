'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

function sha256(body) {
    return crypto.createHash('sha256').update(body).digest('hex');
}

function compareUtf8(left, right) {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function compareCodeUnits(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function sqliteRun(database, sql, params = []) {
    return new Promise((resolve, reject) => database.run(sql, params, function callback(error) {
        if (error) reject(error);
        else resolve({ changes: this.changes, lastID: this.lastID });
    }));
}

function sqliteAll(database, sql, params = []) {
    return new Promise((resolve, reject) => database.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows);
    }));
}

function sqliteExec(database, sql) {
    return new Promise((resolve, reject) => database.exec(sql, (error) => {
        if (error) reject(error);
        else resolve();
    }));
}

function sqliteClose(database) {
    return new Promise((resolve, reject) => database.close((error) => {
        if (error) reject(error);
        else resolve();
    }));
}

function safeChild(root, key) {
    if (typeof key !== 'string' || !key || key.includes('\\') || key.includes('\0')) {
        throw new Error(`Invalid object key: ${String(key)}`);
    }
    const destination = path.resolve(root, ...key.split('/'));
    const relative = path.relative(path.resolve(root), destination);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Object key escapes fixture root: ${key}`);
    }
    return destination;
}

async function writeAtomic(destination, body) {
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
        await fs.promises.writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
        await fs.promises.rename(temporary, destination);
    } finally {
        await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    }
}

class FixtureTransferTransport {
    constructor(root, options = {}) {
        if (!root) throw new Error('Fixture transport requires a root directory');
        this.root = path.resolve(root);
        this.objectsRoot = path.join(this.root, 'objects-store');
        this.metadataRoot = path.join(this.root, 'object-metadata');
        this.databasePath = options.databasePath
            ? path.resolve(options.databasePath)
            : path.join(this.root, 'object-index.sqlite');
        this.database = null;
        this.initialized = null;
    }

    async initialize() {
        if (this.initialized) return this.initialized;
        this.initialized = (async () => {
            await fs.promises.mkdir(this.root, { recursive: true, mode: 0o700 });
            await fs.promises.mkdir(path.dirname(this.databasePath), { recursive: true, mode: 0o700 });
            this.database = new sqlite3.Database(this.databasePath);
            await sqliteExec(this.database, `
                CREATE TABLE IF NOT EXISTS object_index (
                    logical_key TEXT PRIMARY KEY,
                    object_id TEXT NOT NULL UNIQUE,
                    state TEXT NOT NULL CHECK (state IN ('uploading', 'pending', 'ready', 'deleted')),
                    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
                    content_type TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    etag TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
        })();
        return this.initialized;
    }

    metadataPath(key) {
        const identity = crypto.createHash('sha256').update(key).digest('hex');
        return path.join(this.metadataRoot, `${identity}.json`);
    }

    async putObject({ key, body, checksumSha256, contentType, metadata = {} }) {
        const payload = Buffer.from(body);
        const actual = sha256(payload);
        if (actual !== checksumSha256) throw new Error(`Fixture checksum mismatch for ${key}`);
        const destination = safeChild(this.objectsRoot, key);
        await writeAtomic(destination, payload);
        const etag = `\"${actual}\"`;
        await writeAtomic(this.metadataPath(key), Buffer.from(JSON.stringify({
            key,
            contentType,
            checksumSha256,
            metadata,
            etag
        }, null, 2)));
        return { etag, checksumSha256: actual };
    }

    async getObject(key) {
        const destination = safeChild(this.objectsRoot, key);
        let body;
        let metadata;
        try {
            [body, metadata] = await Promise.all([
                fs.promises.readFile(destination),
                fs.promises.readFile(this.metadataPath(key), 'utf8').then(JSON.parse)
            ]);
        } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
        if (metadata.key !== key) throw new Error(`Fixture metadata key mismatch for ${key}`);
        return {
            body,
            contentType: metadata.contentType,
            checksumSha256: metadata.checksumSha256,
            etag: metadata.etag,
            metadata: metadata.metadata || {}
        };
    }

    async headObject(key) {
        const destination = safeChild(this.objectsRoot, key);
        let stat;
        let metadata;
        try {
            [stat, metadata] = await Promise.all([
                fs.promises.stat(destination),
                fs.promises.readFile(this.metadataPath(key), 'utf8').then(JSON.parse)
            ]);
        } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
        if (!stat.isFile()) throw new Error(`Fixture object is not a regular file: ${key}`);
        if (metadata.key !== key) throw new Error(`Fixture metadata key mismatch for ${key}`);
        return {
            size: stat.size,
            contentType: metadata.contentType,
            checksumSha256: metadata.checksumSha256,
            etag: metadata.etag,
            metadata: metadata.metadata || {}
        };
    }

    async listObjects(prefix = '') {
        const objects = [];
        const visit = async (directory, segments) => {
            let entries;
            try {
                entries = await fs.promises.readdir(directory, { withFileTypes: true });
            } catch (error) {
                if (error.code === 'ENOENT') return;
                throw error;
            }
            for (const entry of entries) {
                const childSegments = [...segments, entry.name];
                const key = childSegments.join('/');
                const child = path.join(directory, entry.name);
                if (entry.isSymbolicLink()) throw new Error(`Fixture object store contains symlink: ${key}`);
                if (entry.isDirectory()) await visit(child, childSegments);
                else if (entry.isFile() && key.startsWith(prefix)) {
                    const stat = await fs.promises.stat(child);
                    objects.push({ key, size: stat.size });
                }
            }
        };
        await visit(this.objectsRoot, []);
        return objects.sort((left, right) => compareUtf8(left.key, right.key));
    }

    async deleteObject(key) {
        await Promise.all([
            fs.promises.rm(safeChild(this.objectsRoot, key), { force: true }),
            fs.promises.rm(this.metadataPath(key), { force: true })
        ]);
    }

    async upsertIndex(row) {
        await this.initialize();
        await sqliteRun(this.database, `
            INSERT INTO object_index
                (logical_key, object_id, state, byte_size, content_type, sha256, etag, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(logical_key) DO UPDATE SET
                object_id=excluded.object_id,
                state=excluded.state,
                byte_size=excluded.byte_size,
                content_type=excluded.content_type,
                sha256=excluded.sha256,
                etag=excluded.etag,
                updated_at=CURRENT_TIMESTAMP
        `, [
            row.logicalKey, row.objectId, row.state, row.byteSize,
            row.contentType, row.sha256, row.etag || null
        ]);
    }

    async listIndex() {
        await this.initialize();
        return sqliteAll(this.database, `
            SELECT logical_key AS logicalKey, object_id AS objectId, state,
                   byte_size AS byteSize, content_type AS contentType, sha256, etag
            FROM object_index ORDER BY logical_key
        `);
    }

    async deleteIndex(logicalKey) {
        await this.initialize();
        await sqliteRun(this.database, 'DELETE FROM object_index WHERE logical_key=?', [logicalKey]);
    }

    async deleteIndexIfMatches(row) {
        await this.initialize();
        const result = await sqliteRun(this.database, `
            DELETE FROM object_index
            WHERE logical_key=? AND object_id=? AND state=? AND byte_size=?
              AND content_type=? AND sha256=? AND etag IS ?
        `, [
            row.logicalKey, row.objectId, row.state, row.byteSize,
            row.contentType, row.sha256, row.etag || null
        ]);
        return result.changes === 1;
    }

    async close() {
        if (this.initialized) await this.initialized;
        if (this.database) {
            const database = this.database;
            this.database = null;
            await sqliteClose(database);
        }
    }
}

function rfc3986(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

function hmac(key, value) {
    return crypto.createHmac('sha256', key).update(value).digest();
}

function amzTimestamp(date) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(parameters) {
    return [...parameters.entries()]
        .map(([key, value]) => [rfc3986(key), rfc3986(value)])
        .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
            compareCodeUnits(leftKey, rightKey) || compareCodeUnits(leftValue, rightValue)
        )
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
}

function decodeXml(value) {
    return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|amp|lt|gt|quot|apos);/gi, (entity, decimal, hex) => {
        if (decimal) return String.fromCodePoint(Number(decimal));
        if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
        return { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[entity.toLowerCase()];
    });
}

function xmlValues(document, tag) {
    const values = [];
    const expression = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
    for (const match of document.matchAll(expression)) values.push(decodeXml(match[1]));
    return values;
}

function objectMetadata(headers) {
    const metadata = {};
    for (const [name, value] of headers.entries()) {
        if (!name.startsWith('x-amz-meta-')) continue;
        const key = name.slice('x-amz-meta-'.length);
        try {
            metadata[key] = decodeURIComponent(value);
        } catch {
            metadata[key] = value;
        }
    }
    return metadata;
}

function assertRemoteCredentials(credentials) {
    const required = [
        'accountId', 'apiToken', 'r2AccessKeyId', 'r2SecretAccessKey', 'bucket', 'databaseId'
    ];
    for (const field of required) {
        if (typeof credentials[field] !== 'string' || !credentials[field]) {
            throw new Error(`Remote credential field is required: ${field}`);
        }
    }
    if (!/^[A-Za-z0-9_-]+$/.test(credentials.accountId)) throw new Error('Invalid Cloudflare account ID');
    if (!/^[A-Za-z0-9._-]+$/.test(credentials.bucket)) throw new Error('Invalid R2 bucket name');
    return credentials;
}

function loadRemoteCredentials(file) {
    if (!file) throw new Error('Remote mode requires --credentials <secure-json-file>');
    if (!path.isAbsolute(file)) throw new Error('Remote credentials path must be absolute');
    const linkStat = fs.lstatSync(file);
    if (linkStat.isSymbolicLink()) throw new Error('Remote credentials path must not be a symbolic link');
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('Remote credentials path must be a regular file');
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
        throw new Error('Remote credentials file must not be readable or writable by group/others');
    }
    return assertRemoteCredentials(JSON.parse(fs.readFileSync(file, 'utf8')));
}

class CloudflareRemoteTransport {
    constructor(credentials, options = {}) {
        this.credentials = assertRemoteCredentials({ ...credentials });
        this.fetch = options.fetch || globalThis.fetch;
        this.now = options.now || (() => new Date());
        if (typeof this.fetch !== 'function') throw new Error('Remote transport requires fetch');
    }

    async signedR2Request(method, objectKey, options = {}) {
        const body = options.body ? Buffer.from(options.body) : Buffer.alloc(0);
        const payloadHash = sha256(body);
        const date = this.now();
        const timestamp = amzTimestamp(date);
        const dateStamp = timestamp.slice(0, 8);
        const host = `${this.credentials.accountId}.r2.cloudflarestorage.com`;
        const bucket = rfc3986(this.credentials.bucket);
        const objectPath = objectKey === null
            ? `/${bucket}`
            : `/${bucket}/${objectKey.split('/').map(rfc3986).join('/')}`;
        const parameters = new URLSearchParams(options.query || {});
        const query = canonicalQuery(parameters);
        const headers = new Map([
            ['host', host],
            ['x-amz-content-sha256', payloadHash],
            ['x-amz-date', timestamp]
        ]);
        for (const [name, value] of Object.entries(options.headers || {})) {
            headers.set(name.toLowerCase(), String(value).trim().replace(/\s+/g, ' '));
        }
        const signedHeaders = [...headers.keys()].sort(compareCodeUnits);
        const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers.get(name)}\n`).join('');
        const canonicalRequest = [
            method, objectPath, query, canonicalHeaders, signedHeaders.join(';'), payloadHash
        ].join('\n');
        const scope = `${dateStamp}/auto/s3/aws4_request`;
        const stringToSign = [
            'AWS4-HMAC-SHA256', timestamp, scope, sha256(Buffer.from(canonicalRequest))
        ].join('\n');
        const dateKey = hmac(`AWS4${this.credentials.r2SecretAccessKey}`, dateStamp);
        const regionKey = hmac(dateKey, 'auto');
        const serviceKey = hmac(regionKey, 's3');
        const signingKey = hmac(serviceKey, 'aws4_request');
        const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
        headers.set('authorization', [
            `AWS4-HMAC-SHA256 Credential=${this.credentials.r2AccessKeyId}/${scope}`,
            `SignedHeaders=${signedHeaders.join(';')}`,
            `Signature=${signature}`
        ].join(', '));

        const response = await this.fetch(`https://${host}${objectPath}${query ? `?${query}` : ''}`, {
            method,
            headers: Object.fromEntries(headers),
            ...(method === 'PUT' ? { body } : {})
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`R2 ${method} failed (${response.status}): ${detail.slice(0, 500)}`);
        }
        return response;
    }

    async putObject({ key, body, checksumSha256, contentType, metadata = {} }) {
        const checksumBase64 = Buffer.from(checksumSha256, 'hex').toString('base64');
        const headers = {
            'content-type': contentType,
            'x-amz-checksum-sha256': checksumBase64,
            'x-amz-meta-source-sha256': checksumSha256,
            'x-amz-meta-detected-mime': contentType
        };
        for (const [name, value] of Object.entries(metadata)) {
            const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            headers[`x-amz-meta-${safeName}`] = encodeURIComponent(String(value));
        }
        const response = await this.signedR2Request('PUT', key, { body, headers });
        const returnedChecksum = response.headers.get('x-amz-checksum-sha256');
        return {
            etag: response.headers.get('etag'),
            checksumSha256: returnedChecksum
                ? Buffer.from(returnedChecksum, 'base64').toString('hex')
                : checksumSha256
        };
    }

    async getObject(key) {
        let response;
        try {
            response = await this.signedR2Request('GET', key);
        } catch (error) {
            if (/\(404\)/.test(error.message)) return null;
            throw error;
        }
        const body = Buffer.from(await response.arrayBuffer());
        const checksum = response.headers.get('x-amz-checksum-sha256');
        return {
            body,
            contentType: (response.headers.get('content-type') || '').split(';', 1)[0].toLowerCase(),
            checksumSha256: checksum
                ? Buffer.from(checksum, 'base64').toString('hex')
                : response.headers.get('x-amz-meta-source-sha256'),
            etag: response.headers.get('etag'),
            metadata: objectMetadata(response.headers)
        };
    }

    async headObject(key) {
        let response;
        try {
            response = await this.signedR2Request('HEAD', key);
        } catch (error) {
            if (/\(404\)/.test(error.message)) return null;
            throw error;
        }
        const checksum = response.headers.get('x-amz-checksum-sha256');
        return {
            size: Number(response.headers.get('content-length') || 0),
            contentType: (response.headers.get('content-type') || '').split(';', 1)[0].toLowerCase(),
            checksumSha256: checksum
                ? Buffer.from(checksum, 'base64').toString('hex')
                : response.headers.get('x-amz-meta-source-sha256'),
            etag: response.headers.get('etag'),
            metadata: objectMetadata(response.headers)
        };
    }

    async deleteObject(key) {
        await this.signedR2Request('DELETE', key);
    }

    async listObjects(prefix = '') {
        const objects = [];
        let continuationToken = '';
        do {
            const query = { 'encoding-type': 'url', 'list-type': '2', prefix };
            if (continuationToken) query['continuation-token'] = continuationToken;
            const response = await this.signedR2Request('GET', null, { query });
            const document = await response.text();
            const keys = xmlValues(document, 'Key').map(decodeURIComponent);
            const sizes = xmlValues(document, 'Size').map(Number);
            for (let index = 0; index < keys.length; index += 1) {
                objects.push({ key: keys[index], size: sizes[index] });
            }
            const truncated = xmlValues(document, 'IsTruncated')[0] === 'true';
            continuationToken = truncated ? xmlValues(document, 'NextContinuationToken')[0] || '' : '';
            if (truncated && !continuationToken) throw new Error('R2 listing omitted continuation token');
        } while (continuationToken);
        return objects.sort((left, right) => compareUtf8(left.key, right.key));
    }

    async d1Query(sql, params = []) {
        const response = await this.fetch(
            `https://api.cloudflare.com/client/v4/accounts/${rfc3986(this.credentials.accountId)}` +
            `/d1/database/${rfc3986(this.credentials.databaseId)}/query`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.credentials.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sql, params })
            }
        );
        const document = await response.json().catch(() => null);
        if (!response.ok || !document?.success || !Array.isArray(document.result) || !document.result[0]?.success) {
            const errors = document?.errors || document?.result?.[0]?.error || response.status;
            throw new Error(`D1 query failed: ${JSON.stringify(errors)}`);
        }
        return document.result[0].results || [];
    }

    async upsertIndex(row) {
        await this.d1Query(`
            INSERT INTO object_index
                (logical_key, object_id, state, byte_size, content_type, sha256, etag, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(logical_key) DO UPDATE SET
                object_id=excluded.object_id,
                state=excluded.state,
                byte_size=excluded.byte_size,
                content_type=excluded.content_type,
                sha256=excluded.sha256,
                etag=excluded.etag,
                updated_at=CURRENT_TIMESTAMP
        `, [
            row.logicalKey, row.objectId, row.state, row.byteSize,
            row.contentType, row.sha256, row.etag || null
        ]);
    }

    listIndex() {
        return this.d1Query(`
            SELECT logical_key AS logicalKey, object_id AS objectId, state,
                   byte_size AS byteSize, content_type AS contentType, sha256, etag
            FROM object_index ORDER BY logical_key
        `);
    }

    async deleteIndexIfMatches(row) {
        const deleted = await this.d1Query(`
            DELETE FROM object_index
            WHERE logical_key=? AND object_id=? AND state=? AND byte_size=?
              AND content_type=? AND sha256=? AND etag IS ?
            RETURNING logical_key AS logicalKey
        `, [
            row.logicalKey, row.objectId, row.state, row.byteSize,
            row.contentType, row.sha256, row.etag || null
        ]);
        return deleted.length === 1;
    }

    close() {
        return Promise.resolve();
    }
}

module.exports = {
    CloudflareRemoteTransport,
    FixtureTransferTransport,
    assertRemoteCredentials,
    canonicalQuery,
    loadRemoteCredentials,
    xmlValues
};
