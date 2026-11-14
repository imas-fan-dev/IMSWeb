/**
 * The exchange repository end to end against PostgreSQL: the four entries all
 * funnel into one transaction, so the shelf, the notification and the
 * idempotency anchor are asserted together instead of against stubs.
 */
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import type { NewFudabaCardInput } from '@/ports/repositories/fudaba';
import { queryAll } from '@/infra/db/sql/query';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { cardPageWrite } from '../fixtures/owner-route-fixture';
import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';

const AT = '2026-11-06T00:00:00.000Z';
/** Profile rows keep millisecond timestamps, card rows keep ISO strings. */
const AT_MS = Date.parse(AT);
/** 交换行与扫码会话的主键都是 UUID，测试也照实给。 */
const UUID = {
    auto: '11111111-1111-4111-8111-111111111111',
    manual: '22222222-2222-4222-8222-222222222222',
    retryFirst: '33333333-3333-4333-8333-333333333333',
    retrySecond: '44444444-4444-4444-8444-444444444444',
    retryThird: '55555555-5555-4555-8555-555555555555',
} as const;

function card(
    id: string,
    ownerAccountId: string,
    exchangeMode: 'auto' | 'manual' | 'none' = 'auto',
): NewFudabaCardInput {
    return {
        id,
        ownerAccountId,
        producerName: `Producer ${ownerAccountId}`,
        seriesCodes: ['765'],
        favoriteCharacterIds: [900_001],
        // 名片墙只认 `origin IN ('guest','legacy')` 或线上页面行
        // （NAMECARD_PUBLIC_ORIGIN），夹具照这个布局放一张单面卡。
        pages: [cardPageWrite('front')],
        bio: '',
        tradeNote: '',
        exchangeMode,
        madeOn: null,
        groupName: null,
        producerReading: null,
        isOriginal: false,
        madeWithAi: false,
        visible: true,
        publicationStatus: 'published',
        revision: 0,
        createdAt: AT,
        updatedAt: AT,
        deletedAt: null,
    };
}

async function fixture() {
    const database = await createPostgresTestDatabase('namecard-exchange');
    await seedCanonicalFudabaAgencies(database);
    const schema = new PostgresqlSchemaStrategy();
    const platform = new SqlPlatformAccountRepository(database, schema);
    const fudaba = new SqlFudabaRepository(database, schema);
    const namecards = new SqlCoreRepository(database, schema);
    await Promise.all([platform.initialize(), fudaba.initialize()]);
    await Promise.all([
        platform.createAccountWithProfile({
            id: 'collector',
            status: 'active',
            tokenVersion: 0,
            createdAt: AT_MS,
            updatedAt: AT_MS,            deletedAt: null,
            profile: {
                displayName: 'Collector',
                avatarObjectKey: null,
                avatarExternalUrl: null,
                homeCity: null,
                bio: '',
                updatedAt: AT_MS,
            },
        }),
        platform.createAccountWithProfile({
            id: 'owner',
            status: 'active',
            tokenVersion: 0,
            createdAt: AT_MS,
            updatedAt: AT_MS,
            deletedAt: null,
            profile: {
                displayName: 'Owner',
                avatarObjectKey: null,
                avatarExternalUrl: null,
                homeCity: null,
                bio: '',
                updatedAt: AT_MS,
            },
        }),
    ]);
    /** 名片编号由序列分配，测试不假设它从 1 开始。 */
    async function publish(
        id: string,
        owner: string,
        mode: 'auto' | 'manual' | 'none' = 'auto',
    ): Promise<number> {
        await fudaba.createCard(card(id, owner, mode));
        const [row] = await queryAll<{ card_number: number }>(
            database,
            'SELECT card_number FROM fudaba_cards WHERE id=?',
            [id],
        );
        assert.ok(row, `card ${id} was not created`);
        return Number(row.card_number);
    }
    return { database, fudaba, namecards, publish };
}

describe('namecard exchange repository', () => {
    postgresTest('an automatic exchange lands on both shelves at once', async () => {
        const { namecards, publish } = await fixture();
        const ownerNumber = await publish('owner-auto', 'owner', 'auto');
        const collectorNumber = await publish('collector-card', 'collector', 'auto');

        const result = await namecards.commitExchange({
            id: UUID.auto,
            clientExchangeId: 'client-auto-0001',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [collectorNumber],
            scanSessionId: null,
            at: AT,
        });
        assert.equal(result.exchange.status, 'completed');
        assert.equal(result.idempotent, false);
        assert.deepEqual(result.exchange.skipped, []);

        const mine = await namecards.listCollection({ accountId: 'collector', limit: 10, offset: 0 });
        const theirs = await namecards.listCollection({ accountId: 'owner', limit: 10, offset: 0 });
        assert.equal(mine.total, 1);
        assert.equal(theirs.total, 1);
        assert.equal(mine.rows[0]?.snapshot.producerName, 'Producer owner');
        assert.equal(mine.rows[0]?.hidden_at, null);
        // The shelf keeps the card number the wall shows, not the row id.
        assert.equal(theirs.rows[0]?.card_number, collectorNumber);
    });

    postgresTest('a manual exchange waits for the owner and the decision fills the shelves', async () => {
        const { database, namecards, publish } = await fixture();
        const ownerNumber = await publish('owner-manual', 'owner', 'manual');

        const pending = await namecards.commitExchange({
            id: UUID.manual,
            clientExchangeId: 'client-manual-0001',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [],
            scanSessionId: null,
            at: AT,
        });
        assert.equal(pending.exchange.status, 'pending');
        assert.equal((await namecards.listCollection({ accountId: 'owner', limit: 10, offset: 0 })).total, 0);
        const notified = await queryAll<{ kind: string }>(
            database,
            'SELECT kind FROM namecard_notifications WHERE recipient_account_id=?',
            ['owner'],
        );
        assert.deepEqual(notified.map((row) => row.kind), ['card-exchange-requested']);

        // Only the recipient may settle it.
        assert.deepEqual(
            await namecards.decideExchange({
                exchangeId: UUID.manual,
                accountId: 'collector',
                decision: 'accept',
                at: AT,
            }),
            { status: 'not-found' },
        );
        const accepted = await namecards.decideExchange({
            exchangeId: UUID.manual,
            accountId: 'owner',
            decision: 'accept',
            at: AT,
        });
        assert.deepEqual(accepted, { status: 'completed' });
        // 只申请、不给出时，只有申请方的名片册会多一张。
        assert.equal((await namecards.listCollection({ accountId: 'collector', limit: 10, offset: 0 })).total, 1);
        assert.equal((await namecards.listCollection({ accountId: 'owner', limit: 10, offset: 0 })).total, 0);
        assert.deepEqual(
            await namecards.decideExchange({
                exchangeId: UUID.manual,
                accountId: 'owner',
                decision: 'decline',
                at: AT,
            }),
            { status: 'expired' },
        );
    });

    postgresTest('the client id makes a retry idempotent and a held card is skipped', async () => {
        const { namecards, publish } = await fixture();
        const ownerNumber = await publish('owner-retry', 'owner', 'auto');

        const first = await namecards.commitExchange({
            id: UUID.retryFirst,
            clientExchangeId: 'client-retry-0001',
            source: 'quick',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [],
            scanSessionId: null,
            at: AT,
        });
        assert.equal(first.idempotent, false);

        const retry = await namecards.commitExchange({
            id: UUID.retrySecond,
            clientExchangeId: 'client-retry-0001',
            source: 'quick',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [],
            scanSessionId: null,
            at: AT,
        });
        assert.equal(retry.idempotent, true);
        assert.equal(retry.exchange.id, UUID.retryFirst);
        assert.equal((await namecards.listCollection({ accountId: 'collector', limit: 10, offset: 0 })).total, 1);

        // A later exchange of the same card is recorded but skipped, never duplicated.
        const again = await namecards.commitExchange({
            id: UUID.retryThird,
            clientExchangeId: 'client-retry-0002',
            source: 'quick',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [],
            scanSessionId: null,
            at: AT,
        });
        assert.equal(again.exchange.status, 'completed');
        assert.deepEqual(again.exchange.skipped, [
            { cardNumber: ownerNumber, side: 'target', reason: 'already-owned' },
        ]);
        assert.equal((await namecards.listCollection({ accountId: 'collector', limit: 10, offset: 0 })).total, 1);
    });

    postgresTest('the quick shelf only keeps cards the owner still offers', async () => {
        const { namecards, publish } = await fixture();
        const openNumber = await publish('owner-quick', 'owner', 'auto');
        const closedNumber = await publish('owner-closed', 'owner', 'none');

        await namecards.replaceQuickExchangeCards({
            accountId: 'owner',
            cardNumbers: [openNumber, closedNumber],
        });
        const kept = await namecards.listQuickExchangeCards('owner');
        assert.deepEqual(kept.map((row) => row.card_number), [openNumber]);

        // 保存一份全是不可交换的清单，结果就是清空。
        await namecards.replaceQuickExchangeCards({
            accountId: 'owner',
            cardNumbers: [closedNumber],
        });
        assert.deepEqual(await namecards.listQuickExchangeCards('owner'), []);
    });
});
