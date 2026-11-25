import assert from 'node:assert/strict';
import { FUDABA_GUEST_SUBMISSION_HEADER } from '@imsweb/contracts/fudaba/runtime';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { createFudabaRepositoryFixture, initializedPostgresSchema } from '../fixtures/fudaba-card-fixture';
import { BACKOFFICE_TOKEN, bearerHeaders, cardUpload, OwnerRouteFixture, uploadedFile, PNG_BYTES } from '../fixtures/owner-route-fixture';
import { postgresTest } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';

const CARDS = '/api/community/exchange/cards';
const ADMIN = '/api/admin/cards';
const GUEST = { [FUDABA_GUEST_SUBMISSION_HEADER]: '1' };
const OPERATOR = { Authorization: `Bearer ${BACKOFFICE_TOKEN}`, 'Content-Type': 'application/json' };

postgresTest('operators can enable anonymous namecard submission; cards and artwork stay private until approved', async () => {
    const { database, repository } = await createFudabaRepositoryFixture();
    const fixture = new OwnerRouteFixture();
    const audit = new SqlAuditRepository(database);
    const namecards = new SqlCoreRepository(database, initializedPostgresSchema);
    const runtime = fixture.runtime();
    const app = createTestApp({ ...runtime, fudaba: repository, namecards, audit });
    const request = (path: string, init?: RequestInit) => testRequest(app, path, init);
    const submit = (headers?: Record<string, string>) => request(CARDS, {
        method: 'POST', headers, body: new FormData(),
    });
    const update = (enabled: boolean, headers: Record<string, string> = OPERATOR) => request(`${ADMIN}/guest-submission`, {
        method: 'PUT', headers, body: JSON.stringify({ enabled }),
    });
    const availability = () => request(`${CARDS}/guest-submission`);

    const initial = await availability();
    assert.match(initial.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(await initial.json(), { success: true, enabled: false });
    assert.equal((await submit()).status, 401);
    assert.equal((await submit(GUEST)).status, 403);
    assert.equal(fixture.uploads.calls.length, 0);
    assert.equal((await update(true, { 'Content-Type': 'application/json' })).status, 401);
    assert.equal((await update(true, { ...OPERATOR, Authorization: bearerHeaders().Authorization! })).status, 401);
    const enabled = await update(true);
    assert.equal(enabled.status, 200);
    assert.deepEqual(await enabled.json(), { success: true, enabled: true });
    assert.deepEqual(await (await availability()).json(), { success: true, enabled: true });
    assert.deepEqual(await (await request(`${ADMIN}/guest-submission`, { headers: OPERATOR })).json(),
        { success: true, enabled: true });

    assert.equal((await submit({ ...GUEST, Authorization: 'Bearer invalid' })).status, 401);
    assert.equal((await submit(bearerHeaders(GUEST))).status, 409);
    fixture.accountStatus = 'suspended';
    assert.equal((await submit(bearerHeaders(GUEST))).status, 403);
    fixture.accountStatus = 'active';
    fixture.rateLimiter.deniedBuckets.add('namecard-guest-upload-ip');
    assert.equal((await submit(GUEST)).status, 429);
    fixture.rateLimiter.deniedBuckets.clear();
    assert.equal(fixture.uploads.calls.length, 0);

    const upload = cardUpload();
    fixture.uploads.next = {
        fields: {
            producerName: 'Guest Producer', producerReading: 'guest producer',
            isGroupCard: 'true', groupName: 'Guest Circle', madeOn: '2026-11-25',
            seriesCodes: '["765"]', tags: '["GuestTag"]',
        },
        files: { ...upload.files, images: uploadedFile('middle.png', 'image/png', PNG_BYTES) },
    };
    const submitted = await submit(GUEST);
    assert.equal(submitted.status, 201, await submitted.clone().text());
    assert.deepEqual(await submitted.json(), { success: true });
    const saved = (await database.prepare('SELECT id, card_number, origin, owner_account_id, publication_status, group_name, made_on::text FROM fudaba_cards').all<{
        id: string; card_number: number; origin: string; owner_account_id: string | null;
        publication_status: string; group_name: string; made_on: string;
    }>()).results[0]!;
    assert.equal(saved.origin, 'guest');
    assert.equal(saved.owner_account_id, null);
    assert.equal(saved.publication_status, 'pending');
    assert.equal(saved.group_name, 'Guest Circle');
    assert.equal(saved.made_on, '2026-11-25');
    const card = await repository.findCardById(saved.id);
    assert.equal(card?.pages?.length, 3);
    const publicCard = `/api/cards/${saved.card_number}`;
    const middlePage = `${publicCard}/media/${card!.pages![1]!.page_id}?w=400`;
    assert.deepEqual(await (await request(publicCard)).json(), { card: null });
    assert.equal((await request(middlePage)).status, 404);
    const queue = await request(`${ADMIN}?status=pending`, { headers: OPERATOR });
    assert.equal(queue.status, 200);
    const queued = await queue.json();
    assert.equal(queued.success, true);
    assert.ok(queued.data.some((row: { id: number; origin: string; status: string }) =>
        row.id === Number(saved.card_number) && row.origin === 'guest' && row.status === 'pending'));

    assert.equal((await update(false)).status, 200);
    assert.deepEqual(await (await availability()).json(), { success: true, enabled: false });
    assert.equal((await submit(GUEST)).status, 403);
    assert.equal(fixture.uploads.calls.length, 1);
    const approved = await request(`${ADMIN}/approve/${saved.card_number}`, {
        method: 'POST', headers: OPERATOR, body: JSON.stringify({ expected_revision: 0 }),
    });
    assert.equal(approved.status, 200, await approved.clone().text());
    const published = (await (await request(publicCard)).json()).card;
    assert.equal(published.id, Number(saved.card_number));
    assert.equal(published.pages[1].pageId, card!.pages![1]!.page_id);
    const image = await request(middlePage);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/webp');
});
