import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { test } from 'vitest';
import { verifier } from '../../scripts/migration/preview-media-sync';

const endpoint = 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com';
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
const object = (text) => {
    const bytes = Buffer.from(text);
    return { bytes, ETag: '"' + hash(bytes, 'md5') + '"', Metadata: { sha256: hash(bytes) } };
};
const failure = (status) => Object.assign(new Error('S3 condition'), { $metadata: { httpStatusCode: status } });

function fixture(options = {}) {
    const key = 'pictures/角色 a.png';
    const original = object('source image');
    const source = new Map([[key, original]]);
    const destination = new Map(options.existing ? [[key, options.existing]] : []);
    const calls = [];
    const config = { strategy: 'r2-optimized', serverSideCopy: Boolean(options.serverSideCopy),
        source: { endpoint, bucket: 'production' }, target: { endpoint, bucket: 'preview-test' } };
    const head = (item) => ({ ContentLength: item.bytes.length, ETag: item.ETag, Metadata: item.Metadata });
    const client = (store) => ({
        async send(command, sendOptions) {
            const name = command.constructor.name;
            const input = command.input;
            calls.push({ name, input });
            assert.ok(sendOptions.abortSignal);
            if (name === 'ListObjectsV2Command') {
                return { Contents: [...store].map(([Key, item]) => ({ Key, Size: item.bytes.length, ETag: item.ETag })) };
            }
            if (name === 'HeadObjectCommand') {
                if (!store.has(input.Key)) throw failure(404);
                return head(store.get(input.Key));
            }
            if (name === 'GetObjectCommand') {
                if (options.changedSource && store === source) throw failure(412);
                const item = store.get(input.Key);
                if (!item) throw failure(404);
                assert.equal(input.IfMatch, item.ETag);
                return { ...head(item), Body: Readable.from([item.bytes]) };
            }
            if (name === 'PutObjectCommand') {
                assert.equal(input.IfNoneMatch, '*');
                if (store.has(input.Key)) throw failure(412);
                const item = object(options.corruptWrite ? 'x'.repeat(input.Body.length) : input.Body.toString());
                item.Metadata = input.Metadata;
                store.set(input.Key, item);
                return { ETag: item.ETag };
            }
            if (name === 'CopyObjectCommand') {
                let headers;
                const middleware = command.middlewareStack.resolve(async (args) => {
                    headers = args.request.headers;
                    return { output: {} };
                }, {});
                await middleware({ input, request: { headers: {} } });
                assert.equal(headers['cf-copy-destination-if-none-match'], '*');
                assert.equal(input.CopySourceIfMatch, original.ETag);
                assert.equal(input.CopySource, 'production/pictures/%E8%A7%92%E8%89%B2%20a.png');
                assert.equal(input.MetadataDirective, 'COPY');
                if (options.race) destination.set(key, options.race);
                if (destination.has(input.Key)) throw failure(412);
                destination.set(input.Key, original);
                return { CopyObjectResult: { ETag: original.ETag } };
            }
            throw new Error('Unexpected S3 command: ' + name);
        }
    });
    const verify = verifier(config, { source: client(source), target: client(destination) });
    const payload = JSON.stringify({ physical_key: key, storage_scope: 'public', byte_size: original.bytes.length,
        sha256: original.Metadata.sha256, etag: original.ETag, content_type: 'image/png' });
    return { verify, payload, calls, destination, key, original };
}

test('R2 inventory skips identical objects without downloading or rewriting them', async () => {
    const f = fixture({ existing: object('source image') });
    await f.verify.prepare();
    await f.verify('s3_object_versions', f.payload);
    await f.verify('s3_object_versions', f.payload);
    assert.deepEqual(f.calls.map((call) => call.name), ['ListObjectsV2Command', 'ListObjectsV2Command']);
    assert.equal(f.verify.stats.reused, 1);
    assert.equal(f.verify.stats.checked, 1);
});

test('R2 relay hashes only missing bytes and preserves SHA metadata with create-only writes', async () => {
    const f = fixture();
    await f.verify.prepare();
    await f.verify('s3_object_versions', f.payload);
    assert.equal(f.destination.get(f.key).Metadata.sha256, f.original.Metadata.sha256);
    assert.equal(f.verify.stats.copied, 1);
    assert.equal(f.verify.stats.bytesRelayed, f.original.bytes.length);
    assert.equal(f.calls.filter((call) => call.name === 'GetObjectCommand').length, 2);
});

test('R2 server-side copy guards source and destination and only downloads the result for SHA verification', async () => {
    const f = fixture({ serverSideCopy: true });
    await f.verify.prepare();
    await f.verify('s3_object_versions', f.payload);
    assert.equal(f.verify.stats.serverCopied, 1);
    assert.equal(f.verify.stats.bytesRelayed, 0);
    assert.equal(f.calls.filter((call) => call.name === 'PutObjectCommand').length, 0);
    const reads = f.calls.filter((call) => call.name === 'GetObjectCommand');
    assert.equal(reads.length, 1);
    assert.equal(reads[0].input.Bucket, 'preview-test');
    assert.equal(f.destination.get(f.key), f.original);
});

test('R2 refuses a different existing object and preserves it', async () => {
    const changed = object('preview edit');
    const f = fixture({ existing: changed });
    await f.verify.prepare();
    await assert.rejects(f.verify('s3_object_versions', f.payload), /snapshot digest/);
    assert.equal(f.destination.get(f.key), changed);
    assert.equal(f.calls.filter((call) => call.name === 'PutObjectCommand').length, 0);
});

test('R2 server-side copy cannot overwrite a different object created during the copy race', async () => {
    const changed = object('preview edit');
    const f = fixture({ serverSideCopy: true, race: changed });
    await f.verify.prepare();
    await assert.rejects(f.verify('s3_object_versions', f.payload), /snapshot digest/);
    assert.equal(f.destination.get(f.key), changed);
});

test('R2 relay rejects a source changed after listing without creating a destination', async () => {
    const f = fixture({ changedSource: true });
    await f.verify.prepare();
    await assert.rejects(f.verify('s3_object_versions', f.payload));
    assert.equal(f.destination.size, 0);
    assert.equal(f.calls.filter((call) => call.name === 'PutObjectCommand').length, 0);
});

test('R2 uses SHA metadata for an existing object whose ETag differs without reading the body', async () => {
    const existing = object('source image');
    existing.ETag = '"different-provider-token"';
    const f = fixture({ existing });
    await f.verify.prepare();
    await f.verify('s3_object_versions', f.payload);
    assert.equal(f.verify.stats.reused, 1);
    assert.equal(f.calls.filter((call) => call.name === 'GetObjectCommand').length, 0);
});

test('R2 checks the written bytes even when the returned ETag and copied SHA metadata look consistent', async () => {
    const f = fixture({ corruptWrite: true });
    await f.verify.prepare();
    await assert.rejects(f.verify('s3_object_versions', f.payload), /snapshot digest/);
    assert.equal(f.verify.stats.copied, 0);
});
