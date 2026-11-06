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
import type { FudabaRepository } from '@/ports/repositories/fudaba';
import type {
    NamecardPublicRecord,
    NamecardRepository,
} from '@/ports/repositories/namecards';
import type { RuntimeServices } from '@/ports/runtime-services';
import { assertContractJson } from '../contracts/contract-json';
import { createTestApp } from './test-app';

const FRONT = '/uploads/namecard/original/public-front.webp';
const BACK = '/uploads/namecard/original/public-back.webp';

/** One published card with the fields the public projection reads. */
function publishedCard(id: number): NamecardPublicRecord {
    return {
        id,
        status: 'approved',
        revision: 2,
        created_at: '2026-01-01T00:00:00.000Z',
        image1_url: FRONT,
        image2_url: BACK,
        card_number: id,
        producer_name: '制作人',
        series_code: 'cg',
        series_codes: ['cg'],
        favorite_characters: [],
        middle_image_urls: [],
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
    assert.equal(body.list[0]?.image1_url, FRONT);
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

test('storage rewrites the list and detail media, falling back to the stored path', async () => {
    const app = fixture({ withStorage: true });
    const list = await assertContractJson(
        await app.request('/api/cards?page=1&size=12'),
        200,
        namecardPageSchema,
    );
    assert.equal(list.list[0]?.image1_url, FRONT);
    assert.equal(list.list[0]?.image2_url, BACK);

    const detail = await assertContractJson(
        await app.request('/api/cards/7'),
        200,
        publicNamecardResponseSchema,
    );
    assert.equal((detail as { card: { image1_url: string } }).card.image1_url, FRONT);
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
