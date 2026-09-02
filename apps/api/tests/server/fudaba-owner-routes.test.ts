import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    fudabaCardMutationResponseSchema,
    fudabaOwnerCardDetailSchema,
    fudabaOwnerCardListSchema,
} from '@imsweb/contracts/fudaba';
import {
    ACCOUNT_ID,
    BACKOFFICE_TOKEN,
    CSRF_SECRET,
    JPEG_BYTES,
    OwnerRouteFixture,
    bearerHeaders,
    cardUpload,
    cookieHeaders,
    csrfHash,
    mediaUpload,
    metadataBody,
    ownerCard,
    postCard,
    profileBody,
    uploadedFile
} from '../fixtures/owner-route-fixture';

test('Fudaba public-read and owner-write flags remain independent', async () => {
    const readOnly = new OwnerRouteFixture({
        publicReadEnabled: true,
        writeEnabled: false
    });
    assert.equal((await readOnly.app.request(
        'http://ims.test/api/community/exchange/series'
    )).status, 200);
    assert.equal((await postCard(readOnly)).status, 404);
    assert.equal(readOnly.uploads.calls.length, 0);
    assert.equal((await readOnly.app.request(
        'http://ims.test/api/community/exchange/me/cards',
        { headers: bearerHeaders() }
    )).status, 200, 'owner reads do not depend on either rollout switch');
    assert.equal((await readOnly.app.request(
        'http://ims.test/api/community/exchange/me/series',
        { headers: bearerHeaders() }
    )).status, 200, 'owner series do not depend on either rollout switch');
    const readOnlyProfile = await readOnly.app.request(
        'http://ims.test/api/platform/me',
        { headers: bearerHeaders() }
    );
    assert.equal(readOnlyProfile.status, 200);
    assert.equal((await readOnlyProfile.json() as {
        capabilities: { fudabaWrite: boolean };
    }).capabilities.fudabaWrite, false);

    const writeOnly = new OwnerRouteFixture({
        publicReadEnabled: false,
        writeEnabled: true
    });
    assert.equal((await writeOnly.app.request(
        'http://ims.test/api/community/exchange/series'
    )).status, 404);
    const ownerSeries = await writeOnly.app.request(
        'http://ims.test/api/community/exchange/me/series',
        { headers: bearerHeaders() }
    );
    assert.equal(ownerSeries.status, 200);
    assert.deepEqual(await ownerSeries.json(), {
        items: [{
            id: 1,
            code: '765',
            displayName: '765PRO',
            displayOrder: 0,
            color: '#f34f6d',
            iconUrl: null,
            imageTransform: {
                fit: 'contain',
                focalX: 0.5,
                focalY: 0.5,
                zoom: 1,
                rotation: 0
            },
            activeOfficeCount: 0
        }]
    });
    const cookieOwnerSeries = await writeOnly.app.request(
        'http://ims.test/api/community/exchange/me/series',
        { headers: cookieHeaders(null) }
    );
    assert.equal(cookieOwnerSeries.status, 200);
    assert.equal(cookieOwnerSeries.headers.get('cache-control'),
        'private, no-store');
    assert.match(cookieOwnerSeries.headers.get('vary') || '', /Authorization/);
    assert.match(cookieOwnerSeries.headers.get('vary') || '', /Cookie/);
    assert.equal((await postCard(writeOnly)).status, 201);
});

test('owner routes require Platform auth and reject Backoffice tokens', async () => {
    const fixture = new OwnerRouteFixture();
    const anonymous = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards'
    );
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json() as { code: string }).code,
        'PLATFORM_SESSION_INVALID');

    const wrongRealm = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards',
        { headers: { authorization: `Bearer ${BACKOFFICE_TOKEN}` } }
    );
    assert.equal(wrongRealm.status, 401);
    assert.equal((await wrongRealm.json() as { code: string }).code,
        'PLATFORM_SESSION_INVALID');

    assert.equal((await fixture.app.request(
        'http://ims.test/api/community/exchange/me/series'
    )).status, 401);
    assert.equal((await fixture.app.request(
        'http://ims.test/api/community/exchange/me/series',
        { headers: { authorization: `Bearer ${BACKOFFICE_TOKEN}` } }
    )).status, 401);
});

test('cookie writes require the full CSRF triad while Bearer writes bypass CSRF', async () => {
    const fixture = new OwnerRouteFixture();
    for (const headers of [
        cookieHeaders(null),
        cookieHeaders('different-secret'),
        cookieHeaders(CSRF_SECRET, 'different-secret')
    ]) {
        const response = await fixture.app.request('http://ims.test/api/platform/me', {
            method: 'PUT',
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify(profileBody(fixture.profile.updated_at))
        });
        assert.equal(response.status, 403);
        assert.equal((await response.json() as { code: string }).code,
            'PLATFORM_CSRF_INVALID');
    }
    fixture.session.csrf_hash = csrfHash('different-secret');
    const badStoredHash = await fixture.app.request('http://ims.test/api/platform/me', {
        method: 'PUT',
        headers: { ...cookieHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(profileBody(fixture.profile.updated_at))
    });
    assert.equal(badStoredHash.status, 403);
    fixture.session.csrf_hash = csrfHash(CSRF_SECRET);

    const cookieWrite = await fixture.app.request('http://ims.test/api/platform/me', {
        method: 'PUT',
        headers: { ...cookieHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(profileBody(fixture.profile.updated_at))
    });
    assert.equal(cookieWrite.status, 200);

    const bearerWrite = await fixture.app.request('http://ims.test/api/platform/me', {
        method: 'PUT',
        headers: bearerHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(profileBody(fixture.profile.updated_at))
    });
    assert.equal(bearerWrite.status, 200);
});

test('restricted Platform accounts retain owner reads but cannot mutate or parse uploads', async () => {
    const fixture = new OwnerRouteFixture({ accountStatus: 'restricted' });
    assert.equal((await fixture.app.request('http://ims.test/api/platform/me', {
        headers: bearerHeaders()
    })).status, 200);
    assert.equal((await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards',
        { headers: bearerHeaders() }
    )).status, 200);
    assert.equal((await fixture.app.request(
        'http://ims.test/api/community/exchange/me/series',
        { headers: bearerHeaders() }
    )).status, 200);
    const mutation = await postCard(fixture);
    assert.equal(mutation.status, 403);
    assert.equal((await mutation.json() as { code: string }).code,
        'PLATFORM_ACCOUNT_RESTRICTED');
    assert.equal(fixture.uploads.calls.length, 0);
    assert.equal(fixture.storage.puts.length, 0);
});

test('owner card list and detail hide non-owner cards and raw object keys', async () => {
    const fixture = new OwnerRouteFixture();
    const list = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards',
        { headers: bearerHeaders() }
    );
    assert.equal(list.status, 200);
    const listBody = await list.json() as {
        items: Array<{ id: string; frontImageUrl: string; backImageUrl: string }>;
    };
    fudabaOwnerCardListSchema.parse(listBody);
    assert.equal(listBody.items.length, 1);
    assert.equal(listBody.items[0]?.id, 'owner-card');
    assert.equal(listBody.items[0]?.frontImageUrl,
        '/api/community/exchange/me/cards/owner-card/media/front?v=1');
    assert.equal(JSON.stringify(listBody).includes('object_key'), false);
    assert.equal(JSON.stringify(listBody).includes('protected/fudaba'), false);

    const detail = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/owner-card',
        { headers: bearerHeaders() }
    );
    assert.equal(detail.status, 200);
    const detailBody = fudabaOwnerCardDetailSchema.parse(await detail.json());
    assert.equal(JSON.stringify(detailBody).includes('object_key'), false);
    assert.equal((await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/other-card',
        { headers: bearerHeaders() }
    )).status, 404);
});

test('card creation sniffs both images and writes only protected owner objects', async () => {
    const fixture = new OwnerRouteFixture();
    const response = await postCard(fixture);
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    fudabaCardMutationResponseSchema.parse(body);
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('object_key'), false);
    assert.equal(serialized.includes('protected/fudaba'), false);
    assert.equal(fixture.uploads.calls.length, 1);
    assert.deepEqual(fixture.uploads.calls[0]?.fileFields, ['front', 'back']);
    assert.equal(fixture.images.conversions.length, 2);
    assert.equal(fixture.storage.puts.length, 2);
    assert.equal(fixture.createInputs[0]?.ownerAccountId, ACCOUNT_ID);
    assert.deepEqual(fixture.createInputs[0]?.favoriteIdolIds, [900001]);
    for (const put of fixture.storage.puts) {
        assert.equal(put.options.contentType, 'image/webp');
        assert.equal(put.options.protectedAccess, true);
        assert.match(put.options.ownerToken || '', /^[0-9a-f]{64}$/);
        assert.equal(put.options.metadata?.account, ACCOUNT_ID);
        assert.equal(put.options.metadata?.kind, 'fudaba-card-image');
    }
    assert.deepEqual(
        new Set(fixture.storage.puts.map((put) => put.options.metadata?.side)),
        new Set(['front', 'back'])
    );
});

test('card creation rejects decoded image type mismatches before object writes', async () => {
    const fixture = new OwnerRouteFixture();
    fixture.uploads.next = cardUpload(
        uploadedFile('front.png', 'image/png', JPEG_BYTES)
    );
    const response = await postCard(fixture);
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code,
        'FUDABA_CARD_INVALID');
    assert.equal(fixture.storage.puts.length, 0);
    assert.equal(fixture.createInputs.length, 0);
});

test('card metadata writes enforce owner revision fencing', async () => {
    const fixture = new OwnerRouteFixture();
    const stale = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/owner-card',
        {
            method: 'PUT',
            headers: bearerHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify(metadataBody(0))
        }
    );
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), {
        success: false,
        code: 'FUDABA_CARD_CONFLICT',
        revision: 1
    });
    assert.equal(fixture.metadataInputs[0]?.ownerAccountId, ACCOUNT_ID);

    const intruderTarget = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/other-card',
        {
            method: 'PUT',
            headers: bearerHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify(metadataBody(1))
        }
    );
    assert.equal(intruderTarget.status, 404);
});

// Avatar upload is Platform identity, not Fudaba content; its CAS and
// object-sweep assertions live in `platform-profile.contract.test.ts`.
test('both card-side uploads commit through owner CAS without leaking keys', async () => {
    const fixture = new OwnerRouteFixture();
    let expectedRevision = fixture.cards.get('owner-card')!.revision;
    for (const side of ['front', 'back'] as const) {
        fixture.uploads.next = mediaUpload({
            cardId: 'owner-card',
            expectedRevision: String(expectedRevision)
        });
        const response = await fixture.app.request(
            `http://ims.test/api/community/exchange/uploads/${side}`,
            { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
        );
        const body = await response.json();
        assert.equal(response.status, 200, `${side}: ${JSON.stringify(body)}`);
        assert.equal(JSON.stringify(body).includes('object_key'), false);
        assert.equal(fixture.mediaInputs.at(-1)?.ownerAccountId, ACCOUNT_ID);
        assert.equal(fixture.mediaInputs.at(-1)?.side, side);
        expectedRevision += 1;
    }
    assert.equal(fixture.cards.get('owner-card')?.revision, 3);
    for (const put of fixture.storage.puts) {
        assert.equal(put.options.protectedAccess, true);
        assert.equal(put.options.metadata?.account, ACCOUNT_ID);
    }
});

test('soft deletion fences the owner write and removes protected card media', async () => {
    const fixture = new OwnerRouteFixture();
    const current = fixture.cards.get('owner-card')!;
    const response = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/owner-card',
        {
            method: 'DELETE',
            headers: bearerHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({ expectedRevision: current.revision })
        }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, revision: 2 });
    assert.equal(fixture.deleteInputs[0]?.ownerAccountId, ACCOUNT_ID);
    assert.ok(fixture.cards.get('owner-card')?.deleted_at);
    assert.equal(fixture.storage.objects.has(current.front_object_key), false);
    assert.equal(fixture.storage.objects.has(current.back_object_key), false);
    assert.equal((await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/owner-card',
        { headers: bearerHeaders() }
    )).status, 404);
});

test('card creation cleans confirmed failures but preserves uncertain repository writes', async () => {
    const unavailable = new OwnerRouteFixture();
    const unavailableSeededKeys = new Set(unavailable.storage.objects.keys());
    unavailable.createMode = 'unavailable';
    const unavailableResponse = await postCard(unavailable);
    assert.equal(unavailableResponse.status, 409);
    assert.equal(unavailable.storage.ownedDeletes.length, 2);
    assert.deepEqual(
        new Set(unavailable.storage.objects.keys()),
        unavailableSeededKeys
    );

    const uncertain = new OwnerRouteFixture();
    uncertain.createMode = 'throw';
    const uncertainResponse = await postCard(uncertain);
    assert.equal(uncertainResponse.status, 500);
    assert.equal(uncertain.storage.ownedDeletes.length, 0);
    for (const put of uncertain.storage.puts) {
        assert.equal(uncertain.storage.objects.has(put.key), true);
    }

    const storageFailure = new OwnerRouteFixture();
    const seededKeys = new Set(storageFailure.storage.objects.keys());
    storageFailure.storage.failPutNumber = 2;
    const response = await postCard(storageFailure);
    assert.equal(response.status, 500);
    assert.equal(storageFailure.storage.ownedDeletes.length, 1);
    assert.deepEqual(new Set(storageFailure.storage.objects.keys()), seededKeys);
    assert.equal(storageFailure.createInputs.length, 0);
});

test('committed create and card-side writes recover after the repository throws', async () => {
    const create = new OwnerRouteFixture();
    create.createMode = 'mutate-then-throw';
    const created = await postCard(create);
    const createdBody = await created.json() as {
        card?: { id: string };
    };
    assert.equal(created.status, 201, JSON.stringify(createdBody));
    assert.equal(createdBody.card?.id, create.createInputs[0]?.id);
    assert.equal(create.storage.ownedDeletes.length, 0);
    for (const put of create.storage.puts) {
        assert.equal(create.storage.objects.has(put.key), true);
    }

    const side = new OwnerRouteFixture();
    side.updateMediaMode = 'mutate-then-throw';
    side.uploads.next = mediaUpload({
        cardId: 'owner-card',
        expectedRevision: '1'
    });
    const sideResponse = await side.app.request(
        'http://ims.test/api/community/exchange/uploads/front',
        { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
    );
    const sideBody = await sideResponse.json();
    assert.equal(sideResponse.status, 200, JSON.stringify(sideBody));
    const sideKey = side.mediaInputs[0]?.objectKey;
    assert.ok(sideKey);
    assert.equal(side.cards.get('owner-card')?.front_object_key, sideKey);
    assert.equal(side.storage.objects.has(sideKey), true);
    assert.equal(side.storage.ownedDeletes.length, 0);
});

test('failed confirmation reads preserve objects that ambiguous mutations may reference', async () => {
    const create = new OwnerRouteFixture();
    create.createMode = 'mutate-then-throw';
    create.failCardConfirmationRead = true;
    const created = await postCard(create);
    assert.equal(created.status, 500);
    assert.equal(create.storage.ownedDeletes.length, 0);
    assert.equal(create.cards.has(create.createInputs[0]!.id), true);
    for (const put of create.storage.puts) {
        assert.equal(create.storage.objects.has(put.key), true);
    }

    const side = new OwnerRouteFixture();
    side.updateMediaMode = 'mutate-then-throw';
    side.failCardConfirmationRead = true;
    side.uploads.next = mediaUpload({
        cardId: 'owner-card',
        expectedRevision: '1'
    });
    const sideResponse = await side.app.request(
        'http://ims.test/api/community/exchange/uploads/back',
        { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
    );
    assert.equal(sideResponse.status, 500);
    const sideKey = side.mediaInputs[0]!.objectKey;
    assert.equal(side.cards.get('owner-card')?.back_object_key, sideKey);
    assert.equal(side.storage.objects.has(sideKey), true);
    assert.equal(side.storage.ownedDeletes.length, 0);
});

test('media CAS conflicts clean the new object and old-object failures enqueue compensation', async () => {
    const conflict = new OwnerRouteFixture();
    conflict.updateMediaMode = 'conflict';
    const seededKeys = new Set(conflict.storage.objects.keys());
    conflict.uploads.next = mediaUpload({
        cardId: 'owner-card',
        expectedRevision: '1'
    });
    const rejected = await conflict.app.request(
        'http://ims.test/api/community/exchange/uploads/front',
        { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
    );
    assert.equal(rejected.status, 409);
    assert.equal(conflict.storage.ownedDeletes.length, 1);
    assert.deepEqual(new Set(conflict.storage.objects.keys()), seededKeys);

    const cleanupFailure = new OwnerRouteFixture();
    const oldFront = cleanupFailure.cards.get('owner-card')!.front_object_key;
    cleanupFailure.storage.failDeletes.add(oldFront);
    cleanupFailure.uploads.next = mediaUpload({
        cardId: 'owner-card',
        expectedRevision: '1'
    });
    const saved = await cleanupFailure.app.request(
        'http://ims.test/api/community/exchange/uploads/front',
        { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
    );
    assert.equal(saved.status, 200);
    assert.deepEqual(cleanupFailure.compensation.enqueued.map((item) => ({
        kind: item.kind,
        payload: item.payload
    })), [{ kind: 'delete-object', payload: { key: oldFront } }]);

    const repositoryFailure = new OwnerRouteFixture();
    repositoryFailure.updateMediaMode = 'throw';
    repositoryFailure.uploads.next = mediaUpload({
        cardId: 'owner-card',
        expectedRevision: '1'
    });
    const failed = await repositoryFailure.app.request(
        'http://ims.test/api/community/exchange/uploads/back',
        { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
    );
    assert.equal(failed.status, 500);
    assert.equal(repositoryFailure.storage.ownedDeletes.length, 0);
    const uncertainKey = repositoryFailure.mediaInputs[0]!.objectKey;
    assert.equal(repositoryFailure.storage.objects.has(uncertainKey), true);
});

test('owner media is protected, private, and inaccessible through another account card', async () => {
    const fixture = new OwnerRouteFixture();
    const response = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/owner-card/media/front',
        { headers: bearerHeaders(), redirect: 'manual' }
    );
    assert.equal(response.status, 307);
    assert.match(response.headers.get('location') || '', /^https:\/\/private-media\./);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('vary') || '', /Authorization/);
    assert.deepEqual(fixture.storage.readUrls.at(-1), {
        key: ownerCard().front_object_key,
        method: 'GET'
    });

    const head = await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/owner-card/media/back',
        { method: 'HEAD', headers: bearerHeaders(), redirect: 'manual' }
    );
    assert.equal(head.status, 307);
    assert.equal(fixture.storage.readUrls.at(-1)?.method, 'HEAD');

    const readsBeforeOther = fixture.storage.readUrls.length;
    assert.equal((await fixture.app.request(
        'http://ims.test/api/community/exchange/me/cards/other-card/media/front',
        { headers: bearerHeaders() }
    )).status, 404);
    assert.equal(fixture.storage.readUrls.length, readsBeforeOther);
});

test('card creation uses IP and account upload limits before multipart parsing', async () => {
    const ipLimited = new OwnerRouteFixture();
    ipLimited.rateLimiter.deniedBuckets.add('fudaba-upload-attempt');
    const ipResponse = await postCard(ipLimited);
    assert.equal(ipResponse.status, 429);
    assert.equal(ipLimited.uploads.calls.length, 0);
    assert.equal(ipLimited.storage.puts.length, 0);

    const accountLimited = new OwnerRouteFixture();
    accountLimited.rateLimiter.deniedBuckets.add('platform-upload-account');
    const accountResponse = await postCard(accountLimited);
    assert.equal(accountResponse.status, 429);
    assert.equal((await accountResponse.json() as { code: string }).code,
        'PLATFORM_RATE_LIMITED');
    assert.equal(accountLimited.uploads.calls.length, 0);
    assert.equal(accountLimited.storage.puts.length, 0);

    const successful = new OwnerRouteFixture();
    assert.equal((await postCard(successful)).status, 201);
    const buckets = successful.rateLimiter.calls.map((call) => call.bucket);
    assert.equal(buckets.includes('fudaba-upload-attempt'), true);
    assert.equal(buckets.includes('platform-upload-account'), true);
    assert.equal(buckets.includes('fudaba-write-attempt'), false);
});

test('single-side uploads retain their IP and account pre-parse limits', async () => {
    for (const bucket of ['fudaba-upload-attempt', 'platform-upload-account']) {
        const fixture = new OwnerRouteFixture();
        fixture.rateLimiter.deniedBuckets.add(bucket);
        const response = await fixture.app.request(
            'http://ims.test/api/community/exchange/uploads/front',
            { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
        );
        assert.equal(response.status, 429, bucket);
        assert.equal(fixture.uploads.calls.length, 0, bucket);
        assert.equal(fixture.storage.puts.length, 0, bucket);
    }
});
