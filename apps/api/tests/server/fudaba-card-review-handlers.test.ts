import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    handleReviewFudabaCardClaim,
    handleReviewFudabaRegisteredCard
} from '@/domains/fudaba/handlers/admin-card-reviews';
import type { ObjectStorage, StoredObject } from '@/ports/object-storage';
import type {
    FudabaAdminCardClaimRecord,
    FudabaCardClaimRecord,
    FudabaRegisteredCardReviewRecord,
    FudabaRepository
} from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';

const CREATED_AT = '2026-08-16T19:30:00.000Z';

function idol() {
    return {
        idol_id: 1,
        agency_code: '765',
        name_cn: '天海春香',
        display_order: 0
    };
}

function registeredCard(): FudabaRegisteredCardReviewRecord {
    return {
        id: 'registered-review',
        owner_account_id: 'owner-1',
        producer_name: 'Owner',
        display_name: 'Registered card',
        series_code: '765',
        favorite_idol: '天海春香',
        favorite_idols: [idol()],
        legacy_card_id: null,
        front_object_key: 'community/fudaba/cards/registered-review/front.webp',
        back_object_key: 'community/fudaba/cards/registered-review/back.webp',
        accent: '#f34e6c',
        bio: '',
        trade_note: '',
        available: true,
        source_url: null,
        source_label: null,
        source_credit: null,
        media_rights_status: 'unknown',
        publication_status: 'approving',
        revision: 1,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
        deleted_at: null,
        owner_display_name: 'Owner'
    };
}

function claimRecord(): FudabaCardClaimRecord {
    return {
        id: 'claim-review',
        legacy_card_id: 42,
        claimant_account_id: 'claimant-1',
        target_card_id: null,
        series_code: '765',
        state: 'approving',
        message: 'same owner',
        review_note: '',
        reviewed_by: null,
        reviewed_at: null,
        revision: 1,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
        favorite_idols: [idol()]
    };
}

function adminClaim(): FudabaAdminCardClaimRecord {
    return {
        ...claimRecord(),
        state: 'pending',
        revision: 0,
        claimant_display_name: 'Claimant',
        legacy_image1_url: '/uploads/namecard/original/legacy-front.webp',
        legacy_image2_url: '/uploads/namecard/original/legacy-back.webp'
    };
}

function stored(body: number): StoredObject {
    return {
        body: Uint8Array.of(body),
        size: 1,
        contentType: 'image/webp',
        etag: `etag-${body}`
    };
}

function storage(overrides: Partial<ObjectStorage>): ObjectStorage {
    return {
        async get() { return null; },
        async put(_key, body, options) {
            return {
                body,
                size: body.byteLength,
                contentType: options?.contentType ?? 'application/octet-stream',
                etag: 'etag'
            };
        },
        async delete() {},
        async exists() { return false; },
        async copy() {},
        async move() {},
        async list() { return []; },
        async deletePrefix() {},
        ...overrides
    };
}

function app(runtime: RuntimeServices) {
    const application = new Hono<AppEnvironment>();
    application.use('*', async (c, next) => {
        c.set('services', runtime);
        c.set('backofficeUser', {
            iss: 'imsweb',
            aud: 'ims-backoffice',
            kind: 'backoffice',
            id: 1,
            username: 'reviewer',
            producername: 'Review Admin',
            dept: 'op',
            csrfSecret: 'csrf'
        });
        await next();
    });
    application.put('/registered/:cardId', handleReviewFudabaRegisteredCard);
    application.put('/claims/:claimId', handleReviewFudabaCardClaim);
    return application;
}

function runtime(
    repository: Partial<FudabaRepository>,
    objectStorage: ObjectStorage
): RuntimeServices {
    return {
        fudaba: repository as FudabaRepository,
        storage: objectStorage,
        compensation: {
            async enqueue() { return 'compensation-job'; },
            async run() {}
        },
        config: { clientAddressSource: 'direct' }
    } as RuntimeServices;
}

test('registered-card publish failure re-protects both objects before rollback', async () => {
    const card = registeredCard();
    const published: string[] = [];
    const protectedKeys: string[] = [];
    const rollbacks: Array<[string, number]> = [];
    const repository: Partial<FudabaRepository> = {
        async beginRegisteredCardReview() {
            return { status: 'claimed', card };
        },
        async completeRegisteredCardReview() {
            throw new Error('must not complete after publication failure');
        },
        async rollbackRegisteredCardReview(cardId, revision) {
            rollbacks.push([cardId, revision]);
            return true;
        }
    };
    const objectStorage = storage({
        async publish(key) {
            published.push(key);
            if (key === card.back_object_key) throw new Error('second publish failed');
        },
        async protect(key) {
            protectedKeys.push(key);
        }
    });

    const response = await app(runtime(repository, objectStorage)).request(
        'http://ims.test/registered/registered-review',
        {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                decision: 'approve',
                expectedRevision: 0,
                note: ''
            })
        }
    );

    assert.equal(response.status, 500);
    assert.deepEqual(new Set(published), new Set([
        card.front_object_key,
        card.back_object_key
    ]));
    assert.deepEqual(new Set(protectedKeys), new Set([
        card.front_object_key,
        card.back_object_key
    ]));
    assert.deepEqual(rollbacks, [['registered-review', 1]]);
});

test('partial legacy-media copy cleans the first object and rolls the claim back', async () => {
    const claim = adminClaim();
    const created: Array<{ key: string; ownerToken: string }> = [];
    const deleted: Array<{ key: string; ownerToken: string }> = [];
    let reads = 0;
    const repository: Partial<FudabaRepository> = {
        async findAdminCardClaim() { return claim; },
        async beginCardClaimReview() {
            return { status: 'claimed', claim: claimRecord() };
        },
        async rollbackCardClaimReview() { return true; }
    };
    const objectStorage = storage({
        async get() {
            reads += 1;
            return reads === 1 ? stored(1) : null;
        },
        async put(key, body, options) {
            created.push({ key, ownerToken: options?.ownerToken ?? '' });
            return stored(body[0] ?? 0);
        },
        async publish() {},
        async deleteIfOwned(key, ownerToken) {
            deleted.push({ key, ownerToken });
            return true;
        }
    });

    const response = await app(runtime(repository, objectStorage)).request(
        'http://ims.test/claims/claim-review',
        {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                decision: 'approve',
                expectedRevision: 0,
                note: 'verified'
            })
        }
    );

    assert.equal(response.status, 500);
    assert.equal(created.length, 1);
    assert.deepEqual(deleted, created);
});

test('new claimed-card media is public before the final database transition', async () => {
    const claim = adminClaim();
    const published: string[] = [];
    let completeCalls = 0;
    const savedClaim = { ...claimRecord(), state: 'approved' as const, revision: 2 };
    const repository: Partial<FudabaRepository> = {
        async findAdminCardClaim() { return claim; },
        async beginCardClaimReview() {
            return { status: 'claimed', claim: claimRecord() };
        },
        async completeCardClaimReview() {
            completeCalls += 1;
            assert.equal(published.length, 2);
            return { status: 'saved', claim: savedClaim, card: null };
        },
        async rollbackCardClaimReview() {
            throw new Error('successful claim must not roll back');
        }
    };
    const objectStorage = storage({
        async get(key) {
            return stored(key.includes('front') ? 1 : 2);
        },
        async publish(key) {
            published.push(key);
        }
    });

    const response = await app(runtime(repository, objectStorage)).request(
        'http://ims.test/claims/claim-review',
        {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                decision: 'approve',
                expectedRevision: 0,
                note: 'verified'
            })
        }
    );

    assert.equal(response.status, 200);
    assert.equal(completeCalls, 1);
    assert.equal(published.length, 2);
});


test('uncertain registered-card completion reconciles committed state without protection', async () => {
    const card = registeredCard();
    const protectedKeys: string[] = [];
    let rollbackCalls = 0;
    const repository: Partial<FudabaRepository> = {
        async beginRegisteredCardReview() {
            return { status: 'claimed', card };
        },
        async completeRegisteredCardReview() {
            throw new Error('connection lost after commit');
        },
        async findRegisteredCardForAdmin() {
            return {
                ...card,
                publication_status: 'published',
                media_rights_status: 'approved',
                revision: 2
            };
        },
        async rollbackRegisteredCardReview() {
            rollbackCalls += 1;
            return true;
        }
    };
    const objectStorage = storage({
        async publish() {},
        async protect(key) { protectedKeys.push(key); }
    });

    const response = await app(runtime(repository, objectStorage)).request(
        'http://ims.test/registered/registered-review',
        {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                decision: 'approve',
                expectedRevision: 0,
                note: ''
            })
        }
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, revision: 2 });
    assert.deepEqual(protectedKeys, []);
    assert.equal(rollbackCalls, 0);
});

test('uncertain claimed-card completion preserves committed public media', async () => {
    const pending = adminClaim();
    const approved = {
        ...pending,
        state: 'approved' as const,
        revision: 2,
        target_card_id: 'created-after-commit'
    };
    let claimReads = 0;
    let rollbackCalls = 0;
    let deletedCalls = 0;
    let createdCardId = '';
    const repository: Partial<FudabaRepository> = {
        async findAdminCardClaim() {
            claimReads += 1;
            return claimReads === 1 ? pending : approved;
        },
        async beginCardClaimReview() {
            return { status: 'claimed', claim: claimRecord() };
        },
        async completeCardClaimReview(input) {
            if (input.decision === 'approve' && input.target.kind === 'create') {
                createdCardId = input.target.card.id;
            }
            throw new Error('connection lost after commit');
        },
        async findCardById(cardId) {
            return {
                ...registeredCard(),
                id: cardId,
                legacy_card_id: 42,
                publication_status: 'published',
                media_rights_status: 'approved',
                revision: 0
            };
        },
        async rollbackCardClaimReview() {
            rollbackCalls += 1;
            return true;
        }
    };
    const objectStorage = storage({
        async get(key) { return stored(key.includes('front') ? 1 : 2); },
        async publish() {},
        async deleteIfOwned() {
            deletedCalls += 1;
            return true;
        }
    });

    const response = await app(runtime(repository, objectStorage)).request(
        'http://ims.test/claims/claim-review',
        {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                decision: 'approve',
                expectedRevision: 0,
                note: 'verified'
            })
        }
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, revision: 2 });
    assert.ok(createdCardId);
    assert.equal(deletedCalls, 0);
    assert.equal(rollbackCalls, 0);
});


test('put-after-write failure cleans the uncertain destination and prior copy', async () => {
    const claim = adminClaim();
    const destinations: Array<{ key: string; ownerToken: string }> = [];
    const deleted: Array<{ key: string; ownerToken: string }> = [];
    let puts = 0;
    let rollbackCalls = 0;
    const repository: Partial<FudabaRepository> = {
        async findAdminCardClaim() { return claim; },
        async beginCardClaimReview() {
            return { status: 'claimed', claim: claimRecord() };
        },
        async rollbackCardClaimReview() {
            rollbackCalls += 1;
            return true;
        }
    };
    const objectStorage = storage({
        async get(key) { return stored(key.includes('front') ? 1 : 2); },
        async put(key, body, options) {
            puts += 1;
            destinations.push({ key, ownerToken: options?.ownerToken ?? '' });
            if (puts === 2) throw new Error('connection lost after object write');
            return stored(body[0] ?? 0);
        },
        async publish() {},
        async deleteIfOwned(key, ownerToken) {
            deleted.push({ key, ownerToken });
            return true;
        }
    });

    const response = await app(runtime(repository, objectStorage)).request(
        'http://ims.test/claims/claim-review',
        {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                decision: 'approve',
                expectedRevision: 0,
                note: 'verified'
            })
        }
    );

    assert.equal(response.status, 500);
    assert.equal(destinations.length, 2);
    assert.deepEqual(deleted, destinations);
    assert.equal(rollbackCalls, 1);
});
