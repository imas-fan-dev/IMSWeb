/**
 * The exchange repository end to end against PostgreSQL: the four entries all
 * funnel into one transaction, so the shelf, the notification and the
 * idempotency anchor are asserted together instead of against stubs.
 *
 * The scan lifecycle and the exchange media addresses only exist behind the
 * routes (a token is consumed by a handler gate, page addresses are assembled
 * there), so the same fixture also serves a real Hono app with two fixed
 * platform sessions.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe } from 'vitest';
import type { PlatformAccessTokenInput, PlatformTokenService } from '@/ports/security';
import type { RuntimeServices } from '@/ports/runtime-services';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import type { NewFudabaCardInput } from '@/ports/repositories/fudaba';
import { executeSql, queryAll } from '@/infra/db/sql/query';
import {
    NAMECARD_EXCHANGE_CARD_LIMIT,
    NAMECARD_SCAN_TOKEN_TTL_MS,
} from '@imsweb/contracts/namecards';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { cardPageWrite } from '../fixtures/owner-route-fixture';
import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';

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
    decline: '66666666-6666-4666-8666-666666666666',
    accept: '77777777-7777-4777-8777-777777777777',
    quietShare: '88888888-8888-4888-8888-888888888888',
    quietScan: '99999999-9999-4999-8999-999999999999',
    noneShare: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    noneRequest: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    noneQuick: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    noneScan: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    giveNone: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    targetLocked: 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0',
    targetHidden: 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
    giveBlocked: 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2',
    shelfLocked: 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3',
    shelfHidden: 'f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4',
    shelfDeleted: 'f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5',
    shelfToggle: 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6',
    missingPartial: 'f7f7f7f7-f7f7-4f7f-8f7f-f7f7f7f7f7f7',
    missingRest: 'f8f8f8f8-f8f8-4f8f-8f8f-f8f8f8f8f8f8',
    scanManual: 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f9',
    scanNone: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a',
    scanPlain: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
    scanTwice: '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c',
    scanExpired: '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d',
    scanReplay: '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',
} as const;

/** 路由用例的假会话：Bearer 就是那把固定钥匙，CSRF 对 Bearer 自动放行。 */
const ACCESS_SESSIONS = [
    { accountId: 'collector', token: 'exchange-access-collector', sessionId: 'exchange-session-collector' },
    { accountId: 'owner', token: 'exchange-access-owner', sessionId: 'exchange-session-owner' },
] as const;

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
    // 平台写操作要真会话：令牌与 refresh session 都是固定值，Bearer 走授权头，
    // 因此不经过 CSRF 校验（见 `protectPlatformCsrf`）。
    for (const session of ACCESS_SESSIONS) {
        await executeSql(
            database,
            `INSERT INTO platform_refresh_sessions
                 (id, account_id, token_hash, previous_token_hash, csrf_hash,
                  expires_at, created_at, updated_at, revoked_at, user_agent,
                  ip_address, last_seen_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
            [
                session.sessionId,
                session.accountId,
                createHash('sha256').update(`refresh:${session.accountId}`).digest('hex'),
                createHash('sha256').update(`csrf:${session.accountId}`).digest('hex'),
                Date.now() + 3_600_000,
                AT_MS,
                AT_MS,
            ],
        );
    }
    const platformTokens: PlatformTokenService = {
        async sign(_claims: PlatformAccessTokenInput, _expiresInSeconds: number) {
            throw new Error('the fixture only ever presents a fixed token');
        },
        async verify(value: string) {
            const session = ACCESS_SESSIONS.find((row) => row.token === value);
            if (!session) throw new Error('unknown access token');
            return {
                iss: 'imsweb' as const,
                aud: 'ims-platform' as const,
                kind: 'platform' as const,
                id: session.accountId,
                tokenVersion: 0,
                sessionId: session.sessionId,
                csrfSecret: `csrf:${session.accountId}`,
                jti: `jti:${session.accountId}`,
                iat: Math.floor(AT_MS / 1000),
                exp: Math.floor(AT_MS / 1000) + 3600,
            };
        },
    };
    const app = createTestApp(
        () =>
            ({
                platformAccounts: platform,
                platformTokens,
                namecards,
                fudaba,
                config: {
                    cookieSecure: false,
                    fudabaPublicReadEnabled: true,
                    fudabaWriteEnabled: true,
                },
            }) as RuntimeServices,
    );
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
    /** 交换入口的统一形状：不传的字段就是「没有」。 */
    function commit(input: {
        id: string;
        clientExchangeId: string;
        source: 'card-share' | 'card-request' | 'quick' | 'scan';
        initiatorAccountId: string;
        targetAccountId: string;
        targetCardNumbers: number[];
        giveCardNumbers?: number[];
        scanSessionId?: string | null;
    }) {
        return namecards.commitExchange({
            giveCardNumbers: [],
            scanSessionId: null,
            ...input,
            at: AT,
        });
    }
    const shelf = (accountId: string) =>
        namecards.listCollection({ accountId, limit: 50, offset: 0 });
    /** 通知表只认收件人；`card_number` 是它与那次交换的关联。 */
    const notifications = (accountId: string) =>
        queryAll<{ kind: string; recipient_account_id: string; card_number: number | null }>(
            database,
            `SELECT kind, recipient_account_id, card_number
               FROM namecard_notifications
              WHERE recipient_account_id=?
              ORDER BY created_at, id`,
            [accountId],
        );
    /** 锁卡、删除与改模式在后台各走各的路由，交换侧只关心它落地后的反应。 */
    async function setCardStatus(id: string, status: string): Promise<void> {
        await executeSql(database, 'UPDATE fudaba_cards SET publication_status=? WHERE id=?', [
            status,
            id,
        ]);
    }
    async function setExchangeMode(id: string, mode: string): Promise<void> {
        await executeSql(database, 'UPDATE fudaba_cards SET exchange_mode=? WHERE id=?', [mode, id]);
    }
    const authHeaders = (accountId: 'collector' | 'owner') => {
        const session = ACCESS_SESSIONS.find((row) => row.accountId === accountId);
        assert.ok(session, `no access session for ${accountId}`);
        return { authorization: `Bearer ${session.token}` };
    };
    /** 出示方的二维码会话；返回明文令牌，但只在这一处出现过。 */
    async function openScanSession(
        accountId: 'collector' | 'owner',
        cardNumbers: number[],
    ): Promise<{ token: string; expiresAt: string }> {
        const response = await testRequest(app, '/api/community/exchange/scan/sessions', {
            method: 'POST',
            headers: { ...authHeaders(accountId), 'content-type': 'application/json' },
            body: JSON.stringify({ cardNumbers }),
        });
        assert.equal(response.status, 200, await response.clone().text());
        return (await response.json()) as { token: string; expiresAt: string };
    }
    const scanCommit = (
        accountId: 'collector' | 'owner',
        token: string,
        body: { clientExchangeId: string; giveCardNumbers?: number[] },
    ) =>
        testRequest(app, `/api/community/exchange/scan/sessions/${token}/commit`, {
            method: 'POST',
            headers: { ...authHeaders(accountId), 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
    return {
        database,
        fudaba,
        namecards,
        publish,
        app,
        commit,
        shelf,
        notifications,
        setCardStatus,
        setExchangeMode,
        authHeaders,
        openScanSession,
        scanCommit,
    };
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

    /* ---- 扫码会话生命周期（doc §2.4 / §4.8 / §7） ---- */

    postgresTest('a scan session hands out one plaintext token and stores only its hash', async () => {
        const { database, openScanSession, publish } = await fixture();
        const ownerNumber = await publish('owner-scan-token', 'owner', 'auto');

        const { token, expiresAt } = await openScanSession('owner', [ownerNumber]);
        assert.match(token, /^[0-9a-f]{64}$/);

        const [row] = await queryAll<{
            created_at: string | Date;
            expires_at: string | Date;
            token_hash: string;
        }>(database, 'SELECT created_at, expires_at, token_hash FROM namecard_scan_sessions');
        assert.ok(row);
        // 库存 sha256：明文只在那一条 HTTP 响应里出现过一次（doc §2.4 / §3.5）。
        assert.equal(row.token_hash, createHash('sha256').update(token).digest('hex'));
        assert.notEqual(row.token_hash, token);
        const rows = await queryAll<Record<string, unknown>>(
            database,
            'SELECT * FROM namecard_scan_sessions',
        );
        assert.ok(!Object.values(rows[0]!).includes(token), '明文令牌落库了');

        // 有效期一周：`created_at` 由数据库盖章，容忍进程与库之间的几秒偏差（doc §2.4）。
        const lifetime = new Date(row.expires_at).getTime() - new Date(row.created_at).getTime();
        assert.ok(
            Math.abs(lifetime - NAMECARD_SCAN_TOKEN_TTL_MS) <= 5_000,
            `有效期 ${lifetime}ms 不是一周`,
        );
        assert.equal(new Date(expiresAt).getTime(), new Date(row.expires_at).getTime());
    });

    postgresTest('a scanned code is consumed by the exchange that completed it', async () => {
        const { database, namecards, notifications, openScanSession, publish, scanCommit, shelf } =
            await fixture();
        const ownerNumber = await publish('owner-scan-consume', 'owner', 'auto');
        const collectorNumber = await publish('collector-scan-give', 'collector', 'auto');
        const { token } = await openScanSession('owner', [ownerNumber]);

        const response = await scanCommit('collector', token, {
            clientExchangeId: 'client-scan-0001',
            giveCardNumbers: [collectorNumber],
        });
        assert.equal(response.status, 200, await response.clone().text());
        const result = (await response.json()) as { exchangeId: string; status: string };
        assert.equal(result.status, 'completed');

        const [session] = await queryAll<{
            consumed_at: string | Date | null;
            consumed_by_exchange_id: string | null;
        }>(database, 'SELECT consumed_at, consumed_by_exchange_id FROM namecard_scan_sessions');
        assert.ok(session?.consumed_at, '交换成功后二维码没有被消费');
        assert.equal(session.consumed_by_exchange_id, result.exchangeId);

        // 双向入册；扫码一律不发通知（doc §2.4 / §3.6）。
        assert.equal((await shelf('collector')).total, 1);
        assert.equal((await shelf('owner')).total, 1);
        assert.deepEqual(await notifications('owner'), []);
        assert.deepEqual(await notifications('collector'), []);
        assert.equal(
            (await namecards.listExchanges({ accountId: 'owner', limit: 10, offset: 0 })).total,
            1,
        );
    });

    postgresTest('a consumed code is refused the second time', async () => {
        const { database, openScanSession, publish, scanCommit, shelf } = await fixture();
        const ownerNumber = await publish('owner-scan-once', 'owner', 'auto');
        const { token } = await openScanSession('owner', [ownerNumber]);

        const first = await scanCommit('collector', token, { clientExchangeId: 'client-scan-once-1' });
        assert.equal(first.status, 200, await first.clone().text());
        const firstBody = (await first.json()) as { exchangeId: string };

        // 每个二维码只能用一次（doc §2.4）；第二次换一把幂等键也照样被拒。
        const second = await scanCommit('collector', token, {
            clientExchangeId: 'client-scan-once-2',
        });
        assert.equal(second.status, 409);
        assert.deepEqual(await second.json(), { error: '二维码已失效，请让对方重新生成' });

        // 第一次交换仍是唯一的消费者，名片册没有被写第二遍。
        const [session] = await queryAll<{ consumed_by_exchange_id: string | null }>(
            database,
            'SELECT consumed_by_exchange_id FROM namecard_scan_sessions',
        );
        assert.equal(session?.consumed_by_exchange_id, firstBody.exchangeId);
        assert.equal((await shelf('collector')).total, 1);
    });

    postgresTest('an expired code is refused and stays unconsumed', async () => {
        const { database, openScanSession, publish, scanCommit, shelf } = await fixture();
        const ownerNumber = await publish('owner-scan-expired', 'owner', 'auto');
        const { token } = await openScanSession('owner', [ownerNumber]);
        // 过期时间就是事实来源：连同 created_at 一起拨回上周（表上有 expires_at > created_at）。
        await executeSql(
            database,
            `UPDATE namecard_scan_sessions
                SET created_at = CURRENT_TIMESTAMP - INTERVAL '8 days',
                    expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'`,
        );

        const response = await scanCommit('collector', token, {
            clientExchangeId: 'client-scan-expired',
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { error: '二维码已失效，请让对方重新生成' });
        // 「只在成功时消费」：被拒的提交不留消费痕迹，也写不进名片册（doc §4.8 / §7）。
        const [session] = await queryAll<{ consumed_at: string | Date | null }>(
            database,
            'SELECT consumed_at FROM namecard_scan_sessions',
        );
        assert.equal(session?.consumed_at, null);
        assert.equal((await shelf('collector')).total, 0);
    });

    postgresTest('scan completes a manual or none card and never notifies', async () => {
        const { notifications, openScanSession, publish, scanCommit, shelf } = await fixture();
        const manualNumber = await publish('owner-scan-manual', 'owner', 'manual');
        const noneNumber = await publish('owner-scan-none', 'owner', 'none');

        // 同样一张 manual 卡走非扫码入口会挂起（见上面的用例）；扫码按出示方
        // 当时选好的清单直接完成，不需要任何人再点一次（doc §2.4 / §4.6）。
        const manual = await scanCommit('collector', (await openScanSession('owner', [manualNumber])).token, {
            clientExchangeId: 'client-scan-manual',
        });
        assert.equal(manual.status, 200, await manual.clone().text());
        const manualResult = (await manual.json()) as { status: string };
        assert.equal(manualResult.status, 'completed');

        // `none` 只挡住他人主动向它发起；把它放进二维码就是持有者主动交出（doc §4.3）。
        const none = await scanCommit('collector', (await openScanSession('owner', [noneNumber])).token, {
            clientExchangeId: 'client-scan-none',
        });
        assert.equal(none.status, 200, await none.clone().text());
        const noneResult = (await none.json()) as { status: string };
        assert.equal(noneResult.status, 'completed');

        assert.deepEqual(
            (await shelf('collector')).rows.map((row) => row.card_number).sort((a, b) => a - b),
            [manualNumber, noneNumber].sort((a, b) => a - b),
        );
        assert.deepEqual(await notifications('owner'), []);
        assert.deepEqual(await notifications('collector'), []);
    });

    postgresTest('replaying the same client id returns the first scan record', async () => {
        const { database, namecards, openScanSession, publish, scanCommit, shelf } = await fixture();
        const ownerNumber = await publish('owner-scan-replay', 'owner', 'auto');
        const { token } = await openScanSession('owner', [ownerNumber]);

        const first = await scanCommit('collector', token, { clientExchangeId: 'client-scan-replay' });
        assert.equal(first.status, 200, await first.clone().text());
        const firstBody = (await first.json()) as { exchangeId: string };

        // 网络失败后客户端按本地队列重放同一把幂等键（doc §7）：必须拿回同一条记录。
        const replay = await scanCommit('collector', token, {
            clientExchangeId: 'client-scan-replay',
        });
        assert.equal(replay.status, 200, '重放必须拿回第一次那条记录（doc §7）');
        const replayBody = (await replay.json()) as { exchangeId: string };
        assert.equal(replayBody.exchangeId, firstBody.exchangeId);

        // 幂等也意味着不重复消费、不重复入册（doc §4.1 / §7）。
        const [session] = await queryAll<{ consumed_by_exchange_id: string | null }>(
            database,
            'SELECT consumed_by_exchange_id FROM namecard_scan_sessions',
        );
        assert.equal(session?.consumed_by_exchange_id, firstBody.exchangeId);
        assert.equal((await shelf('collector')).total, 1);
        assert.equal(
            (await namecards.listExchanges({ accountId: 'collector', limit: 10, offset: 0 })).total,
            1,
        );
    });

    /* ---- manual 裁决与三条通知（doc §3.6 / §4） ---- */

    postgresTest('accept fills both shelves and notifies the applicant', async () => {
        const { namecards, notifications, publish, commit, shelf } = await fixture();
        const ownerNumber = await publish('owner-accept', 'owner', 'manual');
        const collectorNumber = await publish('collector-accept', 'collector', 'auto');

        const pending = await commit({
            id: UUID.accept,
            clientExchangeId: 'client-accept-0001',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [collectorNumber],
        });
        assert.equal(pending.exchange.status, 'pending');
        // 持有者先收到「有待确认的交换」，关联的是本轮被取走的名片编号。
        assert.deepEqual(await notifications('owner'), [
            { kind: 'card-exchange-requested', recipient_account_id: 'owner', card_number: ownerNumber },
        ]);

        assert.deepEqual(
            await namecards.decideExchange({
                exchangeId: UUID.accept,
                accountId: 'owner',
                decision: 'accept',
                at: AT,
            }),
            { status: 'completed' },
        );
        // 同意后双向入册，申请方收到结果通知（doc 规则 4 / §3.6）。
        assert.equal((await shelf('collector')).total, 1);
        assert.equal((await shelf('owner')).total, 1);
        assert.deepEqual(await notifications('collector'), [
            { kind: 'card-exchange-accepted', recipient_account_id: 'collector', card_number: ownerNumber },
        ]);
    });

    postgresTest('decline fills neither shelf and notifies the applicant', async () => {
        const { namecards, notifications, publish, commit, shelf } = await fixture();
        const ownerNumber = await publish('owner-decline', 'owner', 'manual');
        const collectorNumber = await publish('collector-decline', 'collector', 'auto');

        await commit({
            id: UUID.decline,
            clientExchangeId: 'client-decline-0001',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [collectorNumber],
        });
        assert.deepEqual(await notifications('collector'), []);

        assert.deepEqual(
            await namecards.decideExchange({
                exchangeId: UUID.decline,
                accountId: 'owner',
                decision: 'decline',
                at: AT,
            }),
            { status: 'declined' },
        );
        // 拒绝 = 两个方向都不入册：申请方拿不到目标卡，持有者也不该收到给出卡。
        assert.equal((await shelf('collector')).total, 0);
        assert.equal((await shelf('owner')).total, 0);
        assert.deepEqual(await notifications('collector'), [
            { kind: 'card-exchange-declined', recipient_account_id: 'collector', card_number: ownerNumber },
        ]);
    });

    postgresTest('automatic and scan exchanges never notify either side', async () => {
        const { notifications, publish, commit, shelf } = await fixture();
        const ownerNumber = await publish('owner-quiet', 'owner', 'auto');
        const collectorNumber = await publish('collector-quiet', 'collector', 'auto');

        // `auto` 与扫码都不需要任何人裁决，因此一条通知都不该落库（doc 规则 3 / §2.4）。
        const shared = await commit({
            id: UUID.quietShare,
            clientExchangeId: 'client-quiet-0001',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });
        assert.equal(shared.exchange.status, 'completed');
        const scanned = await commit({
            id: UUID.quietScan,
            clientExchangeId: 'client-quiet-0002',
            source: 'scan',
            initiatorAccountId: 'owner',
            targetAccountId: 'collector',
            targetCardNumbers: [collectorNumber],
        });
        assert.equal(scanned.exchange.status, 'completed');

        assert.equal((await shelf('collector')).total, 1);
        assert.equal((await shelf('owner')).total, 1);
        assert.deepEqual(await notifications('owner'), []);
        assert.deepEqual(await notifications('collector'), []);
    });

    /* ---- 名片册读取语义（doc §5） ---- */

    postgresTest('a locked card leaves the shelf and comes back when it is unlocked', async () => {
        const { database, namecards, publish, commit, setCardStatus, shelf } = await fixture();
        const ownerNumber = await publish('owner-shelf-locked', 'owner', 'auto');
        await commit({
            id: UUID.shelfLocked,
            clientExchangeId: 'client-shelf-locked',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });
        assert.equal((await shelf('collector')).total, 1);

        await setCardStatus('owner-shelf-locked', 'locked');
        // 名片册没有删除操作，条目还在；锁定只是默认不展示（doc §5）——
        // 审核锁定的卡不该继续出现在别人的册子里。
        const [entry] = await queryAll<{ card_number: number }>(
            database,
            'SELECT card_number FROM namecard_collection_entries WHERE collector_account_id=?',
            ['collector'],
        );
        assert.equal(Number(entry?.card_number), ownerNumber);
        const locked = await shelf('collector');
        assert.equal(locked.total, 0);
        assert.deepEqual(locked.rows, []);

        // 解锁后条目自动重新出现，不需要重写。
        await setCardStatus('owner-shelf-locked', 'published');
        assert.equal((await shelf('collector')).total, 1);
    });

    postgresTest('a hidden card stays on the shelf riding on its snapshot', async () => {
        const { publish, commit, setCardStatus, shelf } = await fixture();
        const ownerNumber = await publish('owner-shelf-hidden', 'owner', 'auto');
        await commit({
            id: UUID.shelfHidden,
            clientExchangeId: 'client-shelf-hidden',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });

        // 持有者删卡 = `hidden`：名片册照旧保留，界面另做标记（doc 规则 6 / §5）。
        await setCardStatus('owner-shelf-hidden', 'hidden');
        const mine = await shelf('collector');
        assert.equal(mine.total, 1);
        assert.equal(mine.rows[0]?.card_number, ownerNumber);
        // 原卡不再在线，渲染只能靠交换当时的快照。
        assert.equal(mine.rows[0]?.card, null);
        assert.equal(mine.rows[0]?.snapshot.producerName, 'Producer owner');
    });

    postgresTest('a deleted card keeps its shelf row pointed at nothing', async () => {
        const { database, publish, commit, shelf } = await fixture();
        const ownerNumber = await publish('owner-shelf-deleted', 'owner', 'auto');
        await commit({
            id: UUID.shelfDeleted,
            clientExchangeId: 'client-shelf-deleted',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });

        // 卡片行被物理删除：card_id 置 NULL，编号与快照接手展示（doc §3.2 / §5）。
        await executeSql(database, 'DELETE FROM fudaba_cards WHERE id=?', ['owner-shelf-deleted']);
        const [entry] = await queryAll<{ card_id: string | null }>(
            database,
            'SELECT card_id FROM namecard_collection_entries WHERE collector_account_id=?',
            ['collector'],
        );
        assert.equal(entry?.card_id, null);

        const mine = await shelf('collector');
        assert.equal(mine.total, 1);
        assert.equal(mine.rows[0]?.card_number, ownerNumber);
        assert.equal(mine.rows[0]?.card, null);
        assert.equal(mine.rows[0]?.snapshot.producerName, 'Producer owner');
        assert.equal(mine.rows[0]?.snapshot.exchangeMode, 'auto');
    });

    postgresTest('the display flag never changes what the account owns', async () => {
        const { namecards, publish, commit, shelf } = await fixture();
        const ownerNumber = await publish('owner-shelf-toggle', 'owner', 'auto');
        const secondNumber = await publish('owner-shelf-toggle-2', 'owner', 'auto');
        await commit({
            id: UUID.shelfToggle,
            clientExchangeId: 'client-shelf-toggle',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });

        assert.equal(
            await namecards.countMissingCollectionCards({
                cardOwnerId: 'owner',
                otherAccountId: 'collector',
            }),
            1,
        );
        assert.equal(
            await namecards.setCollectionHidden({
                accountId: 'collector',
                cardNumber: ownerNumber,
                hidden: true,
                at: AT,
            }),
            true,
        );
        assert.equal((await shelf('collector')).total, 0);
        // `hidden_at` 只影响展示，不影响「已拥有」（doc §3.2）。
        assert.equal(
            await namecards.countMissingCollectionCards({
                cardOwnerId: 'owner',
                otherAccountId: 'collector',
            }),
            1,
        );
        assert.equal(
            await namecards.setCollectionHidden({
                accountId: 'collector',
                cardNumber: ownerNumber,
                hidden: false,
                at: AT,
            }),
            true,
        );
        assert.equal((await shelf('collector')).total, 1);
        // 册子里没有的条目返回 false，路由据此回 404。
        assert.equal(
            await namecards.setCollectionHidden({
                accountId: 'collector',
                cardNumber: secondNumber,
                hidden: true,
                at: AT,
            }),
            false,
        );
    });

    /* ---- countMissingCollectionCards（契约里的 targetMissingCount，doc §8） ---- */

    postgresTest('the missing count is what the other shelf does not hold yet', async () => {
        const { namecards, publish, commit } = await fixture();
        const firstNumber = await publish('owner-missing-1', 'owner', 'auto');
        const secondNumber = await publish('owner-missing-2', 'owner', 'auto');
        const thirdNumber = await publish('owner-missing-3', 'owner', 'auto');
        // `none` 不算可交换，因此从不计入（doc §1 规则 1）。
        await publish('owner-missing-none', 'owner', 'none');

        // 对方一张都没有 → 全部。
        assert.equal(
            await namecards.countMissingCollectionCards({
                cardOwnerId: 'owner',
                otherAccountId: 'collector',
            }),
            3,
        );
        await commit({
            id: UUID.missingPartial,
            clientExchangeId: 'client-missing-1',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [firstNumber],
        });
        assert.equal(
            await namecards.countMissingCollectionCards({
                cardOwnerId: 'owner',
                otherAccountId: 'collector',
            }),
            2,
        );
        await commit({
            id: UUID.missingRest,
            clientExchangeId: 'client-missing-2',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [secondNumber, thirdNumber],
        });
        // 全部拥有 → 0。
        assert.equal(
            await namecards.countMissingCollectionCards({
                cardOwnerId: 'owner',
                otherAccountId: 'collector',
            }),
            0,
        );
    });

    /* ---- 快速交换清单的写入校验（doc §2.3 / §3.4） ---- */

    postgresTest('the quick shelf keeps only published automatic cards', async () => {
        const { namecards, publish, setCardStatus } = await fixture();
        const autoNumber = await publish('owner-quick-auto', 'owner', 'auto');
        const manualNumber = await publish('owner-quick-manual', 'owner', 'manual');
        const noneNumber = await publish('owner-quick-none', 'owner', 'none');
        const lockedNumber = await publish('owner-quick-locked', 'owner', 'auto');
        const hiddenNumber = await publish('owner-quick-hidden', 'owner', 'auto');
        await setCardStatus('owner-quick-locked', 'locked');
        await setCardStatus('owner-quick-hidden', 'hidden');

        // 只有 `published + auto` 能进清单：manual 要逐张确认，进不了「一页全收」的快速交换。
        await namecards.replaceQuickExchangeCards({
            accountId: 'owner',
            cardNumbers: [autoNumber, manualNumber, noneNumber, lockedNumber, hiddenNumber],
        });
        assert.deepEqual(
            (await namecards.listQuickExchangeCards('owner')).map((row) => row.card_number),
            [autoNumber],
        );
    });

    postgresTest('a card that stops being automatic drops off the quick shelf', async () => {
        const { namecards, publish, setCardStatus, setExchangeMode } = await fixture();
        const downgradedNumber = await publish('owner-quick-downgraded', 'owner', 'auto');
        const retiredNumber = await publish('owner-quick-retired', 'owner', 'auto');
        await namecards.replaceQuickExchangeCards({
            accountId: 'owner',
            cardNumbers: [downgradedNumber, retiredNumber],
        });
        assert.equal((await namecards.listQuickExchangeCards('owner')).length, 2);

        // 快速交换链接是长期的，能不能取走由名片当前状态实时决定（doc §2.3 / §3.4）。
        await setExchangeMode('owner-quick-downgraded', 'manual');
        await setCardStatus('owner-quick-retired', 'locked');
        assert.deepEqual(await namecards.listQuickExchangeCards('owner'), []);
    });

    /* ---- 规则矩阵的两个方向（doc §1 规则 1/5/6） ---- */

    postgresTest('a none target card is filtered on the three hands-on entries but not on scan', async () => {
        const { commit, publish, shelf } = await fixture();
        const ownerNumber = await publish('owner-none-target', 'owner', 'none');
        const entries = [
            [UUID.noneShare, 'card-share'],
            [UUID.noneRequest, 'card-request'],
            [UUID.noneQuick, 'quick'],
        ] as const;

        for (const [id, source] of entries) {
            const result = await commit({
                id,
                clientExchangeId: `client-none-${source}`,
                source,
                initiatorAccountId: 'collector',
                targetAccountId: 'owner',
                targetCardNumbers: [ownerNumber],
            });
            // `none` 只阻止别人主动向这张名片发起（doc 规则 1 / §4.3）：整轮仍算成功，但卡不写进册子。
            assert.equal(result.exchange.status, 'completed');
            assert.deepEqual(result.exchange.skipped, [
                { cardNumber: ownerNumber, side: 'target', reason: 'unavailable' },
            ]);
            assert.deepEqual(result.exchange.target_card_numbers, []);
            assert.equal((await shelf('collector')).total, 0);
        }

        // 扫码不看交换模式：出示方把它放进二维码，就是自己主动交出去（doc §2.4 / §4.3）。
        const scanned = await commit({
            id: UUID.noneScan,
            clientExchangeId: 'client-none-scan',
            source: 'scan',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });
        assert.equal(scanned.exchange.status, 'completed');
        assert.deepEqual(scanned.exchange.skipped, []);
        assert.equal((await shelf('collector')).total, 1);
    });

    postgresTest('a none card is still a valid gift from its owner', async () => {
        const { commit, publish, shelf } = await fixture();
        const targetNumber = await publish('owner-gift-target', 'owner', 'auto');
        const giftNumber = await publish('collector-gift-none', 'collector', 'none');

        // `none` 只挡「他人主动向它发起」，不挡持有者拿它当提供方（doc 规则 1）。
        const result = await commit({
            id: UUID.giveNone,
            clientExchangeId: 'client-give-none',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [targetNumber],
            giveCardNumbers: [giftNumber],
        });
        assert.equal(result.exchange.status, 'completed');
        assert.deepEqual(result.exchange.initiator_card_numbers, [giftNumber]);

        const theirs = await shelf('owner');
        assert.equal(theirs.total, 1);
        assert.equal(theirs.rows[0]?.card_number, giftNumber);
    });

    postgresTest('locked and hidden cards travel in neither direction', async () => {
        const { commit, publish, setCardStatus, shelf } = await fixture();
        const lockedTarget = await publish('owner-matrix-locked', 'owner', 'auto');
        const hiddenTarget = await publish('owner-matrix-hidden', 'owner', 'auto');
        const lockedGift = await publish('collector-matrix-locked', 'collector', 'auto');
        const hiddenGift = await publish('collector-matrix-hidden', 'collector', 'auto');
        const openTarget = await publish('owner-matrix-open', 'owner', 'auto');
        await setCardStatus('owner-matrix-locked', 'locked');
        await setCardStatus('owner-matrix-hidden', 'hidden');
        await setCardStatus('collector-matrix-locked', 'locked');
        await setCardStatus('collector-matrix-hidden', 'hidden');

        // 锁定/隐藏的目标卡「不可用」，取不到就不入册（doc 规则 5/6 / §4.3）。
        const lockedResult = await commit({
            id: UUID.targetLocked,
            clientExchangeId: 'client-matrix-locked',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [lockedTarget],
        });
        assert.equal(lockedResult.exchange.status, 'completed');
        assert.deepEqual(lockedResult.exchange.target_card_numbers, []);
        const hiddenResult = await commit({
            id: UUID.targetHidden,
            clientExchangeId: 'client-matrix-hidden',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [hiddenTarget],
        });
        assert.equal(hiddenResult.exchange.status, 'completed');
        assert.deepEqual(hiddenResult.exchange.target_card_numbers, []);
        assert.equal((await shelf('collector')).total, 0);

        // 锁定/隐藏的给出卡同样被过滤，对方名片册不变（doc §4.4）。
        const blockedGifts = await commit({
            id: UUID.giveBlocked,
            clientExchangeId: 'client-matrix-gives',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [openTarget],
            giveCardNumbers: [lockedGift, hiddenGift],
        });
        assert.equal(blockedGifts.exchange.status, 'completed');
        assert.deepEqual(blockedGifts.exchange.initiator_card_numbers, []);
        assert.equal((await shelf('owner')).total, 0);
        assert.equal((await shelf('collector')).total, 1);
    });

    /* ---- 交换里的媒体地址（doc §13） ---- */

    postgresTest('the shelf and the share page hand out exchange media addresses', async () => {
        const { app, authHeaders, commit, namecards, publish } = await fixture();
        const ownerNumber = await publish('owner-media', 'owner', 'auto');
        await commit({
            id: UUID.auto,
            clientExchangeId: 'client-media-0001',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });
        const slug = await namecards.ensureExchangeLink('owner-media');

        // 仓储只给页面行，handler 必须换成交换作用域的路由地址；把对象键
        // （`community/fudaba/cards/...`）直接交给浏览器是加载不出来的（doc §13）。
        const shelf = await testRequest(app, '/api/community/exchange/me/collection', {
            headers: authHeaders('collector'),
        });
        assert.equal(shelf.status, 200, await shelf.clone().text());
        const collection = (await shelf.json()) as {
            list: Array<{ card: { pages?: Array<{ url: string; thumbUrl: string }> } | null }>;
        };
        const pages = collection.list[0]?.card?.pages ?? [];
        assert.ok(pages.length > 0, '名片册条目没有页面地址');
        for (const page of pages) {
            assert.match(page.url, /^\/api\/community\/exchange\/cards\/[^/]+\/media\//);
            assert.match(page.thumbUrl, /^\/api\/community\/exchange\/cards\/[^/]+\/media\//);
            assert.ok(!page.url.includes('community/fudaba/cards'), `裸对象键：${page.url}`);
        }

        const share = await testRequest(app, `/api/community/exchange/card/${slug}`, {
            headers: authHeaders('collector'),
        });
        assert.equal(share.status, 200, await share.clone().text());
        const body = (await share.json()) as {
            state: string;
            card: { pages?: Array<{ thumbUrl: string }> };
        };
        assert.equal(body.state, 'available');
        assert.match(body.card.pages?.[0]?.thumbUrl ?? '', /^\/api\/community\/exchange\/cards\//);
    });

    /* ---- 快速交换清单的上限（契约常量，doc §12） ---- */

    postgresTest('the quick shelf refuses more than twenty cards', async () => {
        const { app, authHeaders } = await fixture();
        const put = (cardNumbers: number[]) =>
            testRequest(app, '/api/community/exchange/me/quick', {
                method: 'PUT',
                headers: { ...authHeaders('owner'), 'content-type': 'application/json' },
                body: JSON.stringify({ cardNumbers }),
            });
        const numbers = (count: number) =>
            Array.from({ length: count }, (_, index) => 900_000 + index);

        // 20 张是契约上限（`NAMECARD_EXCHANGE_CARD_LIMIT`）：刚好 20 收下，21 直接 400。
        assert.equal((await put(numbers(NAMECARD_EXCHANGE_CARD_LIMIT))).status, 200);
        const tooMany = await put(numbers(NAMECARD_EXCHANGE_CARD_LIMIT + 1));
        assert.equal(tooMany.status, 400);
        assert.deepEqual(await tooMany.json(), { error: '清单参数无效' });
    });
});
