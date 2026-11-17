/**
 * The public card routes: the wall list, one card by number, the wall backlog
 * panel and the random ownerless pick. These four read paths share the same
 * projections, so they run against one stub runtime instead of a database.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    namecardPageSchema,
    publicNamecardResponseSchema,
    randomOwnerlessCardErrorSchema,
    randomOwnerlessCardSchema,
    wallInsightsSchema,
} from '@imsweb/contracts/namecards';
import type {
    FudabaCardPageRecord,
    FudabaRepository,
} from '@/ports/repositories/fudaba';
import type {
    NamecardPublicRecord,
    NamecardRepository,
} from '@/ports/repositories/namecards';
import type { RuntimeServices } from '@/ports/runtime-services';
import { assertContractJson } from '../contracts/contract-json';
import { createTestApp } from './test-app';

/** 公开投影只给页面地址（带对象版本 `?v=`）：正/反/中间由页序推导。 */
const FRONT_PAGE = '/api/cards/7/media/front';
const BACK_PAGE = '/api/cards/7/media/back';

/** 页面行是公开投影片的媒体来源。 */
function cardPageRows(): FudabaCardPageRecord[] {
    return [
        {
            page_id: 'front',
            display_order: 1,
            object_version: '11111111-1111-4111-8111-111111111111',
            width: 100,
            height: 50,
        },
        {
            page_id: 'back',
            display_order: 2,
            object_version: '22222222-2222-4222-8222-222222222222',
            width: 100,
            height: 50,
        },
    ];
}

/** One published card with the fields the public projection reads. */
function publishedCard(id: number): NamecardPublicRecord {
    return {
        id,
        status: 'approved',
        revision: 2,
        created_at: '2026-01-01T00:00:00.000Z',
        card_number: id,
        producer_name: '制作人',
        series_code: 'cg',
        series_codes: ['cg'],
        favorite_characters: [],
        credits: [],
    };
}

function storage() {
    const calls: string[] = [];
    return {
        calls,
        storage: {
            async createPublicReadUrl(key: string) {
                calls.push(key);
                return undefined;
            },
            async exists(key: string) {
                calls.push(key);
                return false;
            },
            async get(key: string) {
                calls.push(key);
                if (!key.startsWith('community/fudaba/cards/')) return null;
                return {
                    body: new Uint8Array([1]),
                    size: 1,
                    contentType: 'image/webp',
                    etag: 'test'
                };
            },
        },
    };
}

function fixture(overrides: {
    cards?: NamecardPublicRecord[];
    repository?: Partial<NamecardRepository>;
    fudaba?: Partial<FudabaRepository>;
    withStorage?: boolean;
} = {}) {
    const cards = overrides.cards ?? [publishedCard(7)];
    const namecards: Partial<NamecardRepository> = {
        async countApprovedCards() {
            return cards.length;
        },
        async listApprovedCards() {
            return cards;
        },
        async findApprovedCard(id) {
            return cards.find((card) => card.card_number === id) ?? null;
        },
        ...overrides.repository,
    };
    const fudaba: Partial<FudabaRepository> = {
        async wallInsights() {
            return {
                guest_total: 12,
                ownerless: 3,
                ownerless_missing_series: 1,
                claimed: 4,
                claims_pending: 1,
                supplemented: 2,
                supplements_pending: 1,
                contributors: [
                    { account_id: 'producer-1', display_name: '制作人', points: 9, cards: 2 },
                ],
                viewer: null,
            } as Awaited<ReturnType<FudabaRepository['wallInsights']>>;
        },
        async randomOwnerlessCardMissingSeries() {
            return 42;
        },
        async listCardPagesBatchByNumbers(numbers) {
            return numbers.includes(7)
                ? new Map([[7, { live: cardPageRows(), pending: [] }]])
                : new Map();
        },
        async listLegacyNamecardClaimStatuses(ids, viewerAccountId) {
            return ids.map((id) => ({
                legacy_card_id: id,
                claim_status: 'claimed' as const,
                viewer_claim_state: viewerAccountId === 'producer-1' ? 'approved' as const : null,
                claimer_name: '认领人',
                claimer_account_id: 'producer-1',
                claimer_uid: 9,
                supplement_pending: true,
            }));
        },
        ...overrides.fudaba,
    };
    const { storage: objectStorage } = storage();
    const runtime = {
        namecards: namecards as NamecardRepository,
        fudaba: fudaba as FudabaRepository,
        config: { fudabaPublicReadEnabled: true },
        ...(overrides.withStorage ? { storage: objectStorage } : {}),
    } as RuntimeServices;
    return createTestApp(() => runtime);
}

test('the wall lists published cards with the shared page contract', async () => {
    const app = fixture();
    const body = await assertContractJson(
        await app.request('/api/cards?page=1&size=12'),
        200,
        namecardPageSchema,
    );
    assert.equal(body.total, 1);
    assert.equal(body.totalPage, 1);
    assert.equal(body.list[0]?.cardNumber, 7);
    // 页面地址带对象版本 `?v=`：断言路径前缀，版本号由页面行决定。
    assert.equal(body.list[0]?.pages?.[0]?.url?.startsWith(FRONT_PAGE), true);
    assert.equal(body.list[0]?.pages?.[1]?.url?.startsWith(BACK_PAGE), true);
    assert.equal(body.list[0]?.hasOwner, false);
});

test('one card by number keeps the list projection and 404s on unknown numbers', async () => {
    const app = fixture();
    const found = await assertContractJson(
        await app.request('/api/cards/7'),
        200,
        publicNamecardResponseSchema,
    );
    assert.equal((found as { card: { cardNumber: number } | null }).card?.cardNumber, 7);

    const missing = await assertContractJson(
        await app.request('/api/cards/8'),
        200,
        publicNamecardResponseSchema,
    );
    assert.equal((missing as { card: unknown }).card, null);
});

test('the exchange media route serves page rows by card UUID', async () => {
    const cardId = '11111111-1111-4111-8111-111111111111';
    const key = `community/fudaba/cards/${cardId}/live/front.1.webp`;
    const app = fixture({
        withStorage: true,
        fudaba: {
            async findPublishedCardPageKeyById(id, pageId) {
                assert.equal(id, cardId);
                assert.equal(pageId, 'front');
                return key;
            }
        }
    });
    const response = await app.request(
        `/api/community/exchange/cards/${cardId}/media/front`
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1]));
});

test('the wall and the deep-linked card both carry the page addresses', async () => {
    const app = fixture();
    const list = await assertContractJson(
        await app.request('/api/cards?page=1&size=12'),
        200,
        namecardPageSchema,
    );
    assert.equal(list.list[0]?.pages?.[0]?.url?.startsWith(FRONT_PAGE), true);

    const detail = await assertContractJson(
        await app.request('/api/cards/7'),
        200,
        publicNamecardResponseSchema,
    );
    assert.equal(detail.card?.pages?.[0]?.url?.startsWith(FRONT_PAGE), true);
});

test('the wall backlog panel maps the repository counts and stays readable without it', async () => {
    const app = fixture();
    const body = await assertContractJson(
        await app.request('/api/cards/wall-insights'),
        200,
        wallInsightsSchema,
    );
    assert.deepEqual(body, {
        guestTotal: 12,
        ownerless: 3,
        ownerlessMissingSeries: 1,
        claimed: 4,
        claimsPending: 1,
        supplemented: 2,
        supplementsPending: 1,
        contributors: [
            { accountId: 'producer-1', displayName: '制作人', points: 9, cards: 2 },
        ],
        viewer: null,
    });

    const empty = createTestApp(() => ({} as RuntimeServices));
    const fallback = await assertContractJson(
        await empty.request('/api/cards/wall-insights'),
        200,
        wallInsightsSchema,
    );
    assert.equal(fallback.ownerless, 0);
    assert.deepEqual(fallback.contributors, []);
});

test('the random pick returns a number or the no-card error', async () => {
    const app = fixture();
    const body = await assertContractJson(
        await app.request('/api/cards/random-ownerless'),
        200,
        randomOwnerlessCardSchema,
    );
    assert.deepEqual(body, { cardNumber: 42 });

    const none = fixture({
        fudaba: {
            async randomOwnerlessCardMissingSeries() {
                return null;
            },
        },
    });
    const error = await assertContractJson(
        await none.request('/api/cards/random-ownerless'),
        404,
        randomOwnerlessCardErrorSchema,
    );
    assert.deepEqual(error, { success: false, code: 'FUDABA_NO_OWNERLESS_CARD' });
});
