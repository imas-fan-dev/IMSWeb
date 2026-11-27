import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { executeSql } from '@/infra/db/sql/query';
import { S3ObjectStorage } from '@/infra/oss/s3/object-storage';
import { S3UploadStateMachine } from '@/infra/oss/s3/upload-state-machine';
import { createFudabaRepositoryFixture, initializedPostgresSchema } from '../fixtures/fudaba-card-fixture';
import { OwnerRouteFixture, PNG_BYTES } from '../fixtures/owner-route-fixture';
import { postgresTest } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';

postgresTest('serves allowlisted legacy namecard image bytes for GET and HEAD', async () => {
    const { database } = await createFudabaRepositoryFixture();
    const namecards = new SqlCoreRepository(database, initializedPostgresSchema);
    const state = new S3UploadStateMachine(database);
    let reads = 0;
    let objectBytes = Buffer.from(PNG_BYTES);
    const client = {
        async send(command: unknown) {
            assert.ok(command instanceof GetObjectCommand, 'only public byte reads are allowed');
            assert.equal(command.input.Key, key);
            reads += 1;
            return {
                Body: { transformToByteArray: async () => Uint8Array.from(objectBytes) },
                ContentType: 'image/png',
                ETag: '"legacy-original"'
            };
        },
        destroy() {}
    } as unknown as Pick<S3Client, 'send' | 'destroy'>;
    const storage = new S3ObjectStorage(client, { bucket: 'legacy-test', readUrlTtlSeconds: 30 }, async () => {
        throw new Error('legacy uploads must never be signed');
    }, state);
    const app = createTestApp({ ...new OwnerRouteFixture().runtime(), namecards, storage });
    const path = '/uploads/namecard/original/from-live.png';
    const key = 'community/namecards/assets/from-live/image.png';
    const objectId = 'legacy-object-id';
    const number = await namecards.insertPendingCard({
        image1Url: path,
        image2Url: '/uploads/namecard/original/from-live-back.png',
        hash1: 'legacy-test-front', hash2: 'legacy-test-back',
        ip: '127.0.0.1', withdrawalTokenHash: 'a'.repeat(64),
        seriesCode: 'cg', characterIds: [900_002, 900_001]
    });
    const cardId = `guest-${number}`;
    const pageVersion = '11111111-1111-4111-8111-111111111111';
    await executeSql(database,
        `INSERT INTO fudaba_card_pages (card_id, queue, page_id, display_order, object_version,
            width, height, created_at, updated_at)
         VALUES (?, 'live', 'front', 1, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [cardId, pageVersion]);
    await executeSql(database,
        `INSERT INTO namecard_legacy_public_uploads (path, card_id, page_id, page_version, logical_key, object_id)
         VALUES (?, ?, 'front', ?, ?, ?)`,
        [path, cardId, pageVersion, key, objectId]);
    await executeSql(database,
        `INSERT INTO s3_object_versions
            (object_id, byte_size, content_type, sha256, etag, created_at, physical_key, storage_scope)
         VALUES (?, ?, 'image/png', ?, '"legacy-original"', 0, ?, 'public')`,
        [objectId, objectBytes.byteLength, createHash('sha256').update(objectBytes).digest('hex'), key]);
    await executeSql(database,
        `INSERT INTO s3_object_index (logical_key, object_id, state, incarnation, updated_at)
         VALUES (?, ?, 'ready', 1, 0)`, [key, objectId]);

    const denied = async (deniedPath = path) => {
        const response = await testRequest(app, deniedPath);
        assert.equal(response.status, 404);
        assert.equal(response.headers.get('location'), null);
        assert.equal(await response.text(), 'Not Found');
    };
    await denied(); // A known ready object is not enough to expose a pending card.
    assert.equal(reads, 0);
    await executeSql(database, "UPDATE fudaba_cards SET publication_status='published' WHERE id=?", [cardId]);
    const get = await testRequest(app, path);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('content-type'), 'image/png');
    assert.match(get.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), objectBytes);
    const head = await testRequest(app, path, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(objectBytes.byteLength));
    assert.equal((await head.arrayBuffer()).byteLength, 0);

    await denied('/uploads/namecard/original/unlisted.png');
    await denied('/uploads/namecard/original/%66rom-live.png');
    await executeSql(database, "UPDATE fudaba_cards SET publication_status='hidden' WHERE id=?", [cardId]);
    await denied();
    await executeSql(database, "UPDATE fudaba_cards SET publication_status='published' WHERE id=?", [cardId]);
    await executeSql(database, "UPDATE s3_object_versions SET storage_scope='private' WHERE object_id=?", [objectId]);
    await denied();
    await executeSql(database, "UPDATE s3_object_versions SET storage_scope='public' WHERE object_id=?", [objectId]);
    await executeSql(database, "UPDATE s3_object_index SET state='pending' WHERE logical_key=?", [key]);
    await denied();
    await executeSql(database, "UPDATE s3_object_index SET state='ready' WHERE logical_key=?", [key]);
    await executeSql(database, "UPDATE namecard_legacy_public_uploads SET object_id='stale' WHERE path=?", [path]);
    await denied();
    await executeSql(database, 'UPDATE namecard_legacy_public_uploads SET object_id=? WHERE path=?', [objectId, path]);
    assert.equal(reads, 2);

    objectBytes = Buffer.from(objectBytes);
    objectBytes[0] ^= 1;
    await denied(); // The same-sized bytes at the physical key are no longer the approved version.
    await executeSql(database,
        "UPDATE fudaba_card_pages SET object_version='22222222-2222-4222-8222-222222222222' WHERE card_id=?",
        [cardId]);
    await denied();
    assert.equal(reads, 3);
});
