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
import { createHash, randomUUID } from 'node:crypto';
import { describe } from 'vitest';
import type { ObjectStorage } from '@/ports/object-storage';
import type { PlatformAccessTokenInput, PlatformTokenService } from '@/ports/security';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { StaticAssets } from '@/ports/http';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import type { FudabaCardPageWrite, NewFudabaCardInput } from '@/ports/repositories/fudaba';
import { executeSql, queryAll } from '@/infra/db/sql/query';
import {
    NAMECARD_EXCHANGE_CARD_LIMIT,
    NAMECARD_SCAN_TOKEN_TTL_MS,
    namecardCardShareLinkSchema,
    namecardCardShareSchema,
    namecardCollectionOwnersSchema,
    namecardCollectionPageSchema,
    namecardExchangeDetailSchema,
    namecardExchangeHistoryPageSchema,
    namecardExchangeResultSchema,
    namecardPageSchema,
    namecardQuickExchangeSchema,
    namecardQuickSettingsSchema,
} from '@imsweb/contracts/namecards';
import { namecardNotificationListResponseSchema } from '@imsweb/contracts/fudaba/card-claims';
import { NAMECARD_EXCHANGE_PENDING_TTL_MS } from '@/domains/community/namecards/exchange/lifecycle';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { cardPageWrite } from '../fixtures/owner-route-fixture';
import { assertContractJson } from '../contracts/contract-json';
import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';

/**
 * 「现在」用真实时钟：待确认交换的有效期按 `now()` 算（7 天），固定成过去某天会让
 * 所有 pending 断言一次性过期。需要「8 天前」的用例直接改库里的 `created_at`。
 */
const AT = new Date().toISOString();
/** 站点空壳的最小可注入形态：默认 title / description 都在，注入必须把它们换掉。 */
const SHELL_HTML =
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charSet="utf-8"/>' +
    '<title>IMSWeb | 偶像大师交流站</title><meta name="description" content="默认简介"/></head>' +
    '<body id="root"></body></html>';

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
    idemCountFirst: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
    idemCountReplay: '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a',
    mediaHidden: '1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c',
    heldKey: '1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d',
    shelfSoftDeleted: '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e',
    profileCollected: '2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a',
    shareCollected: '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b',
    pickerOwned: '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a',
    expire: '4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a4a4a',
    expireRetry: '4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b',
    dedupeFirst: '4c4c4c4c-4c4c-4c4c-8c4c-4c4c4c4c4c4c',
    dedupeSecond: '4d4d4d4d-4d4d-4d4d-8d4d-4d4d4d4d4d4d',
    dedupeThird: '4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4e4e4e',
    staleDecide: '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a',
    settledDecide: '5b5b5b5b-5b5b-4b5b-8b5b-5b5b5b5b5b5b',
    detail: '5c5c5c5c-5c5c-4c5c-8c5c-5c5c5c5c5c5c',
    detailSettled: '5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d',
    notifyRequested: '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e',
    notifyDeclined: '5f5f5f5f-5f5f-4f5f-8f5f-5f5f5f5f5f5f',
    noneReject: '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a',
    overwriteFirst: '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b',
    overwriteSecond: '6c6c6c6c-6c6c-4c6c-8c6c-6c6c6c6c6c6c',
    albumRoute: '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a',
    albumDeclaration: '7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b',
} as const;

/** 路由用例的假会话：Bearer 就是那把固定钥匙，CSRF 对 Bearer 自动放行。 */
const ACCESS_SESSIONS = [
    { accountId: 'collector', token: 'exchange-access-collector', sessionId: 'exchange-session-collector' },
    { accountId: 'owner', token: 'exchange-access-owner', sessionId: 'exchange-session-owner' },
    { accountId: 'stranger', token: 'exchange-access-stranger', sessionId: 'exchange-session-stranger' },
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
        // 详情端点的第三方视角：既不是发起方也不是目标方，必须 404。
        platform.createAccountWithProfile({
            id: 'stranger',
            status: 'active',
            tokenVersion: 0,
            createdAt: AT_MS,
            updatedAt: AT_MS,
            deletedAt: null,
            profile: {
                displayName: 'Stranger',
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
                // 分享页的 OGP 注入要读站点空壳；这里给一份最小可注入的 HTML。
                staticAssets: {
                    async fetch() {
                        return new Response('asset not found', { status: 404 });
                    },
                    async fetchShell() {
                        return new Response(SHELL_HTML, {
                            headers: { 'Content-Type': 'text/html; charset=UTF-8' },
                        });
                    },
                } satisfies StaticAssets,
                // 媒体路由要真出图：夹具只实现读侧，`createReadUrl` 返回私有直链。
                storage: {
                    async get() {
                        return null;
                    },
                    async put(): Promise<never> {
                        throw new Error('the fixture never writes objects');
                    },
                    async delete() {},
                    async exists() {
                        return false;
                    },
                    async copy() {},
                    async move() {},
                    async list() {
                        return [];
                    },
                    async deletePrefix() {},
                    async createReadUrl(key: string) {
                        return {
                            url: `https://objects.example.test/${encodeURIComponent(key)}`,
                            visibility: 'private' as const,
                        };
                    },
                } satisfies ObjectStorage,
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
        // 多页卡：正面 + 若干中间页 + 背面，页数就是数组长度。
        pages: FudabaCardPageWrite[] = [cardPageWrite('front')],
    ): Promise<number> {
        await fudaba.createCard({ ...card(id, owner, mode), pages });
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
    const authHeaders = (accountId: 'collector' | 'owner' | 'stranger') => {
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
    /** 出示方轮询:二维码还没被扫 / 已过期 / 已被消费。 */
    const scanStatus = (accountId: 'collector' | 'owner', token: string) =>
        testRequest(app, `/api/community/exchange/scan/sessions/${token}`, {
            headers: authHeaders(accountId),
        });
    /** 属主清单布局：读 / 整份保存。 */
    const getLayout = (accountId: 'collector' | 'owner') =>
        testRequest(app, '/api/community/exchange/me/cards/layout', {
            headers: authHeaders(accountId),
        });
    const putLayout = (accountId: 'collector' | 'owner', body: unknown) =>
        testRequest(app, '/api/community/exchange/me/cards/layout', {
            method: 'PUT',
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
        scanStatus,
        getLayout,
        putLayout,
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
            { status: 'expired', stale: false },
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

    postgresTest('a replayed commit reports the same missing count as the first one', async () => {
        const { namecards, publish } = await fixture();
        const ownerNumber = await publish('owner-idem-count', 'owner', 'auto');
        const givenNumber = await publish('collector-idem-give', 'collector', 'auto');
        // 第二张留在自己手里，才是重放能看出差别的那张。
        await publish('collector-idem-keep', 'collector', 'auto');

        const input = {
            id: UUID.idemCountFirst,
            clientExchangeId: 'client-idem-count-0001',
            source: 'quick' as const,
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [givenNumber],
            scanSessionId: null,
            at: AT,
        };
        const first = await namecards.commitExchange(input);
        assert.equal(first.idempotent, false);
        // 给出 givenNumber 之后，owner 名下还缺 collector 的那一张。
        assert.equal(first.targetMissingCount, 1);

        // doc §7：重放拿回同一条记录，缺口数也必须同口径，不能因为是重放就填 0。
        const replay = await namecards.commitExchange({ ...input, id: UUID.idemCountReplay });
        assert.equal(replay.idempotent, true);
        assert.equal(replay.targetMissingCount, 1);
        // 重放不重写：名片册只有收到的那一张（册子不装自己的卡），交换记录也仍然只有一条。
        assert.equal(
            (await namecards.listCollection({ accountId: 'owner', limit: 10, offset: 0 })).total,
            1,
        );
        assert.equal(
            (await namecards.listExchanges({ accountId: 'collector', limit: 10, offset: 0 })).total,
            1,
        );
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

    postgresTest('a fresh scan session polls back as active for its owner', async () => {
        const { openScanSession, publish, scanStatus } = await fixture();
        const ownerNumber = await publish('owner-scan-active', 'owner', 'auto');
        const { token, expiresAt } = await openScanSession('owner', [ownerNumber]);

        const response = await scanStatus('owner', token);
        assert.equal(response.status, 200, await response.clone().text());
        const body = (await response.json()) as {
            status: string;
            expiresAt: string;
            exchangeId: string | null;
        };
        // 二维码还没被扫：出示方轮询只该看到「还在等」。
        assert.equal(body.status, 'active');
        assert.equal(body.exchangeId, null);
        assert.equal(Date.parse(body.expiresAt), Date.parse(expiresAt));
    });

    postgresTest('an expired scan session polls back as expired', async () => {
        const { database, openScanSession, publish, scanStatus } = await fixture();
        const ownerNumber = await publish('owner-scan-status-expired', 'owner', 'auto');
        const { token } = await openScanSession('owner', [ownerNumber]);
        // 过期时间就是事实来源：连同 created_at 一起拨回上周（表上有 expires_at > created_at）。
        await executeSql(
            database,
            `UPDATE namecard_scan_sessions
                SET created_at = CURRENT_TIMESTAMP - INTERVAL '8 days',
                    expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'`,
        );

        const response = await scanStatus('owner', token);
        assert.equal(response.status, 200, await response.clone().text());
        const body = (await response.json()) as {
            status: string;
            exchangeId: string | null;
        };
        // 过期但没被消费：没有交换可报告。
        assert.equal(body.status, 'expired');
        assert.equal(body.exchangeId, null);
    });

    postgresTest('a consumed scan session polls back as committed with its exchange', async () => {
        const { database, openScanSession, publish, scanCommit, scanStatus } = await fixture();
        const ownerNumber = await publish('owner-scan-status-committed', 'owner', 'auto');
        const { token } = await openScanSession('owner', [ownerNumber]);

        const commitResponse = await scanCommit('collector', token, {
            clientExchangeId: 'client-scan-status',
        });
        assert.equal(commitResponse.status, 200, await commitResponse.clone().text());
        const { exchangeId } = (await commitResponse.json()) as { exchangeId: string };

        const response = await scanStatus('owner', token);
        assert.equal(response.status, 200, await response.clone().text());
        const body = (await response.json()) as {
            status: string;
            exchangeId: string | null;
        };
        assert.equal(body.status, 'committed');
        assert.equal(body.exchangeId, exchangeId);

        // 消费优先于过期：交换已经完成，时间越过后也不该退回 expired。
        await executeSql(
            database,
            `UPDATE namecard_scan_sessions
                SET created_at = CURRENT_TIMESTAMP - INTERVAL '8 days',
                    expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'`,
        );
        const later = (await (await scanStatus('owner', token)).json()) as { status: string };
        assert.equal(later.status, 'committed');
    });

    postgresTest('a scan session is invisible to anyone but its creator', async () => {
        const { openScanSession, publish, scanStatus } = await fixture();
        const ownerNumber = await publish('owner-scan-status-owner', 'owner', 'auto');
        const { token } = await openScanSession('owner', [ownerNumber]);

        // 别人的 token 与根本不存在的 token 必须长一个样，否则能靠状态码试出存在性。
        const foreign = await scanStatus('collector', token);
        const missing = await scanStatus('collector', 'a'.repeat(64));
        assert.equal(foreign.status, 404);
        assert.equal(missing.status, 404);
        assert.deepEqual(await foreign.json(), await missing.json());
    });

    postgresTest('the scan status route validates its token and requires a session', async () => {
        const { app, authHeaders } = await fixture();
        const unauthenticated = await app.request(
            `/api/community/exchange/scan/sessions/${'a'.repeat(64)}`,
        );
        assert.equal(unauthenticated.status, 401);

        const malformed = await testRequest(
            app,
            '/api/community/exchange/scan/sessions/not-a-token',
            { headers: authHeaders('owner') },
        );
        assert.equal(malformed.status, 400);
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

    postgresTest('an owner-deleted card keeps its projection and its media on the shelf', async () => {
        const { app, authHeaders, publish, commit, setCardStatus, shelf } = await fixture();
        const ownerNumber = await publish('owner-shelf-hidden', 'owner', 'auto');
        await commit({
            id: UUID.shelfHidden,
            clientExchangeId: 'client-shelf-hidden',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });

        // 持有者删卡 = `hidden`：条目保留，并且**照旧拿到最新投影与图**（doc 规则 6 / §5）。
        await setCardStatus('owner-shelf-hidden', 'hidden');
        const mine = await shelf('collector');
        assert.equal(mine.total, 1);
        assert.equal(mine.rows[0]?.card_number, ownerNumber);
        assert.equal(mine.rows[0]?.card_status, 'hidden');
        assert.ok(mine.rows[0]?.card, '原卡下线后仍要带实时投影');
        assert.equal(mine.rows[0]?.snapshot.producerName, 'Producer owner');

        // 路由层：`available` 只表示「仍对外可见」，页面地址照发。
        const response = await testRequest(app, '/api/community/exchange/me/collection', {
            headers: authHeaders('collector'),
        });
        assert.equal(response.status, 200, await response.clone().text());
        const collection = (await response.json()) as {
            list: Array<{
                available: boolean;
                card: { pages?: Array<{ thumbUrl: string }> } | null;
            }>;
        };
        assert.equal(collection.list[0]?.available, false);
        const pages = collection.list[0]?.card?.pages ?? [];
        assert.ok(pages.length > 0, '下线后仍要给页面地址');
        assert.match(pages[0]?.thumbUrl ?? '', /^\/api\/community\/exchange\/cards\//);
    });

    postgresTest('a physically deleted card leaves the shelf entirely', async () => {
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

        // 卡片行被物理删除：条目还在（`card_id` 置空、快照保留），但整条不再进名片册。
        await executeSql(database, 'DELETE FROM fudaba_cards WHERE id=?', ['owner-shelf-deleted']);
        const [entry] = await queryAll<{ card_id: string | null }>(
            database,
            'SELECT card_id FROM namecard_collection_entries WHERE collector_account_id=?',
            ['collector'],
        );
        assert.equal(entry?.card_id, null);

        const mine = await shelf('collector');
        assert.equal(mine.total, 0);
        assert.deepEqual(mine.rows, []);
    });

    postgresTest('a card row deleted by moderation leaves the shelf entirely', async () => {
        const { database, publish, commit, shelf } = await fixture();
        const ownerNumber = await publish('owner-shelf-soft-deleted', 'owner', 'auto');
        await commit({
            id: UUID.shelfSoftDeleted,
            clientExchangeId: 'client-shelf-soft-deleted',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });

        // 后台判决删除只打 `deleted_at`，不动 `publication_status`：条目的卡片行不再可见，
        // 列表与 `total` 一并排除。
        await executeSql(database, 'UPDATE fudaba_cards SET deleted_at=? WHERE id=?', [
            AT,
            'owner-shelf-soft-deleted',
        ]);
        const mine = await shelf('collector');
        assert.equal(mine.total, 0);
        assert.deepEqual(mine.rows, []);
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

    postgresTest('the held media key answers only for hidden cards the viewer holds', async () => {
        const { publish, commit, setCardStatus, namecards } = await fixture();
        const ownerNumber = await publish('owner-held-key', 'owner', 'auto');
        await commit({
            id: UUID.heldKey,
            clientExchangeId: 'client-held-key',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });
        const held = {
            viewerAccountId: 'collector',
            cardId: 'owner-held-key',
            pageId: 'front',
        };

        // 还在线时由公开读取负责，这个入口不参与。
        assert.equal(await namecards.findHeldCardPageKey(held), null);
        await setCardStatus('owner-held-key', 'hidden');
        assert.ok(await namecards.findHeldCardPageKey(held), '持有者要拿到对象键');
        // 没收到这张卡的人、或页 id 不存在，都不放行。
        assert.equal(
            await namecards.findHeldCardPageKey({ ...held, viewerAccountId: 'owner' }),
            null,
        );
        assert.equal(
            await namecards.findHeldCardPageKey({ ...held, pageId: 'back' }),
            null,
        );
    });

    postgresTest('a hidden card hands its media to the holders and nobody else', async () => {
        const { app, authHeaders, publish, commit, setCardStatus } = await fixture();
        const ownerNumber = await publish('owner-media-hidden', 'owner', 'auto');
        await commit({
            id: UUID.mediaHidden,
            clientExchangeId: 'client-media-hidden',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });
        const mediaUrl = '/api/community/exchange/cards/owner-media-hidden/media/front';

        // 还 published：匿名也读得到，公开路径不变。
        const open = await testRequest(app, mediaUrl, { redirect: 'manual' });
        assert.equal(open.status, 307, await open.clone().text());

        await setCardStatus('owner-media-hidden', 'hidden');

        // 下线之后：匿名 404、没收到这张卡的账号 404，只有持有者拿得到，且只能进私有缓存。
        const anonymous = await testRequest(app, mediaUrl, { redirect: 'manual' });
        assert.equal(anonymous.status, 404);
        const stranger = await testRequest(app, mediaUrl, {
            headers: authHeaders('owner'),
            redirect: 'manual',
        });
        assert.equal(stranger.status, 404, '原卡持有者自己也没有收集这张卡');
        const holder = await testRequest(app, mediaUrl, {
            headers: authHeaders('collector'),
            redirect: 'manual',
        });
        assert.equal(holder.status, 307, await holder.clone().text());
        assert.match(holder.headers.get('location') ?? '', /owner-media-hidden/);
        // 实际头来自 `/api/community/exchange/*` 的前缀中间件，比 handler 自己声明的更严。
        assert.equal(holder.headers.get('cache-control'), 'private, no-store');
    });

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

    /* ---- 分享页读取：逐卡 collected / 属主 slug / 站点 OGP（任务 11-18 §3.1–§3.4） ---- */

    postgresTest('the quick page lists the target cards instead of failing on the mode filter', async () => {
        const { app, publish, namecards } = await fixture();
        const auto = await publish('owner-quick-live', 'owner', 'auto');
        const manual = await publish('owner-quick-manual', 'owner', 'manual');
        const none = await publish('owner-quick-none', 'owner', 'none');

        // 曾经这里少了表别名：`card.exchange_mode` 让整条 SQL 报
        // 「missing FROM-clause entry」→ 每个 handle 都 500。
        // 候选名单收 `manual + auto`、只排除 `none`（doc §3 第 1 点）。
        const target = await namecards.findExchangeTarget('owner');
        assert.ok(target, '账号 id 应该能解析到主页');
        assert.deepEqual(
            target.cards
                .map((card) => Number(card.card_number))
                .sort((left, right) => left - right),
            [auto, manual].sort((left, right) => left - right),
        );

        await namecards.replaceQuickExchangeCards({
            accountId: 'owner',
            cardNumbers: [auto, manual],
        });
        // 路由在候选之上再按清单过滤一次：页面只出 `published + auto`。
        const response = await assertContractJson(
            await testRequest(app, '/api/community/exchange/quick/owner'),
            200,
            namecardQuickExchangeSchema,
        );
        assert.equal(response.handle, 'owner');
        assert.deepEqual(
            response.cards.map((card) => card.cardNumber),
            [auto],
        );
        assert.ok(!response.cards.some((card) => card.cardNumber === none));
    });

    postgresTest('the share page marks the cards the viewer already holds', async () => {
        const { app, publish, commit, authHeaders, namecards } = await fixture();
        const held = await publish('owner-share-held', 'owner', 'auto');
        const fresh = await publish('owner-share-fresh', 'owner', 'auto');
        // 浏览者通过一次交换拿到其中一张，另一张没拿。
        await commit({
            id: UUID.shareCollected,
            clientExchangeId: 'client-share-collected-1',
            source: 'quick',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [held],
        });
        await namecards.replaceQuickExchangeCards({
            accountId: 'owner',
            cardNumbers: [held, fresh],
        });

        // 单卡分享页：已收到的卡标 `collected: true`。
        const heldSlug = await namecards.ensureExchangeLink('owner-share-held');
        const heldShare = await assertContractJson(
            await testRequest(app, `/api/community/exchange/card/${heldSlug}`, {
                headers: authHeaders('collector'),
            }),
            200,
            namecardCardShareSchema,
        );
        assert.equal(heldShare.card.collected, true);

        // 没收到的那张整份省略该字段，而不是写 `false`。
        const freshSlug = await namecards.ensureExchangeLink('owner-share-fresh');
        const freshShare = await assertContractJson(
            await testRequest(app, `/api/community/exchange/card/${freshSlug}`, {
                headers: authHeaders('collector'),
            }),
            200,
            namecardCardShareSchema,
        );
        assert.equal('collected' in freshShare.card, false);

        // 快速页一次批量查完清单：部分已拥有时只标那一张。
        const quick = await assertContractJson(
            await testRequest(app, '/api/community/exchange/quick/owner', {
                headers: authHeaders('collector'),
            }),
            200,
            namecardQuickExchangeSchema,
        );
        const rows = new Map(quick.cards.map((card) => [card.cardNumber, card]));
        assert.equal(rows.get(held)?.collected, true);
        assert.equal('collected' in (rows.get(fresh) ?? {}), false);

        // 未登录浏览不查名片册：字段一律不出现。
        const anonymous = await assertContractJson(
            await testRequest(app, `/api/community/exchange/card/${heldSlug}`),
            200,
            namecardCardShareSchema,
        );
        assert.equal('collected' in anonymous.card, false);
    });

    /* ---- 选卡候选的目标视角（任务 11-18 design §2；只有传 `target` 才出现） ---- */

    postgresTest('the candidate list marks the cards the target already owns', async () => {
        const { app, publish, commit, authHeaders, namecards } = await fixture();
        const mineHeld = await publish('collector-picker-held', 'collector', 'auto');
        const mineFresh = await publish('collector-picker-fresh', 'collector', 'auto');
        const ownerCard = await publish('owner-picker', 'owner', 'auto');
        // 目标先通过一次交换收下我其中一张：只有那张该带 `targetOwns`。
        await commit({
            id: UUID.pickerOwned,
            clientExchangeId: 'client-picker-owned-1',
            source: 'quick',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerCard],
            giveCardNumbers: [mineHeld],
        });

        const body = await assertContractJson(
            await testRequest(app, '/api/community/exchange/me/quick?target=owner', {
                headers: authHeaders('collector'),
            }),
            200,
            namecardQuickSettingsSchema,
        );
        // 候选仍然只有「我自己」的卡：对方的卡不在这里出现。
        const rows = new Map(body.cards.map((card) => [card.cardNumber, card]));
        assert.deepEqual(
            [...rows.keys()].sort((left, right) => left - right),
            [mineHeld, mineFresh].sort((left, right) => left - right),
        );
        assert.equal(rows.get(mineHeld)?.targetOwns, true);
        // 对方没收的那张整份省略字段，而不是写 `false`。
        assert.equal('targetOwns' in (rows.get(mineFresh) ?? {}), false);
        // 缺口数与分享页同源：我有、可交换、对方还没收下的张数。
        assert.equal(body.targetMissingCount, 1);
        assert.equal(
            body.targetMissingCount,
            await namecards.countMissingCollectionCards({
                cardOwnerId: 'collector',
                otherAccountId: 'owner',
            }),
        );
    });

    postgresTest('the candidate list omits the target view when no target is asked for', async () => {
        const { app, publish, authHeaders } = await fixture();
        await publish('collector-plain', 'collector', 'auto');

        const body = await assertContractJson(
            await testRequest(app, '/api/community/exchange/me/quick', {
                headers: authHeaders('collector'),
            }),
            200,
            namecardQuickSettingsSchema,
        );
        // 两个字段连键都不该有，而不是 `false` / `0`。
        assert.equal('targetMissingCount' in body, false);
        assert.ok(body.cards.length > 0);
        for (const card of body.cards) {
            assert.equal('targetOwns' in card, false);
        }
    });

    postgresTest('an unknown target is a 404 and the viewer himself is no target at all', async () => {
        const { app, publish, authHeaders } = await fixture();
        await publish('collector-self', 'collector', 'auto');

        const ghost = await testRequest(app, '/api/community/exchange/me/quick?target=ghost', {
            headers: authHeaders('collector'),
        });
        assert.equal(ghost.status, 404);
        // 与快速交换页同文案。
        assert.deepEqual(await ghost.json(), { error: '找不到这位制作人' });

        // 目标就是自己 = 没传目标：两个字段都省略，状态码仍是 200。
        const self = await assertContractJson(
            await testRequest(app, '/api/community/exchange/me/quick?target=collector', {
                headers: authHeaders('collector'),
            }),
            200,
            namecardQuickSettingsSchema,
        );
        assert.equal('targetMissingCount' in self, false);
        assert.ok(self.cards.length > 0);
        for (const card of self.cards) {
            assert.equal('targetOwns' in card, false);
        }
    });

    postgresTest('the candidate list reads the target account from a public card number', async () => {
        const { app, publish, commit, authHeaders } = await fixture();
        const mineHeld = await publish('collector-targetcard-held', 'collector', 'auto');
        await publish('collector-targetcard-fresh', 'collector', 'auto');
        const ownerCard = await publish('owner-targetcard', 'owner', 'auto');
        // 目标先收下我其中一张：`targetOwns` / `targetMissingCount` 才有信息量。
        await commit({
            id: UUID.pickerOwned,
            clientExchangeId: 'client-targetcard-owned-1',
            source: 'quick',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerCard],
            giveCardNumbers: [mineHeld],
        });

        const byHandle = await assertContractJson(
            await testRequest(app, '/api/community/exchange/me/quick?target=owner', {
                headers: authHeaders('collector'),
            }),
            200,
            namecardQuickSettingsSchema,
        );
        // 名片墙 / 主页只有卡号（公开投影的 `claimerUid` 恒为 null），卡号必须给出
        // 与 `?target=` 逐字相同的一份响应。
        const byCard = await assertContractJson(
            await testRequest(app, `/api/community/exchange/me/quick?targetCard=${ownerCard}`, {
                headers: authHeaders('collector'),
            }),
            200,
            namecardQuickSettingsSchema,
        );
        assert.deepEqual(byCard, byHandle);

        const rows = new Map(byCard.cards.map((card) => [card.cardNumber, card]));
        assert.equal(rows.get(mineHeld)?.targetOwns, true);
        assert.equal(byCard.targetMissingCount, 1);
    });

    postgresTest('an unknown or unclaimed target card is a 404', async () => {
        const { app, database, publish, authHeaders } = await fixture();
        await publish('collector-targetcard-guard', 'collector', 'auto');
        const unclaimed = await publish('owner-targetcard-unclaimed', 'owner', 'auto');
        // 未认领（无属主）的卡：没有可交换的账号，跟卡号不存在同一种结果。
        await executeSql(
            database,
            `UPDATE fudaba_cards
                SET owner_account_id=NULL, trade_note=NULL, exchange_mode='none'
              WHERE id=?`,
            ['owner-targetcard-unclaimed'],
        );

        for (const number of [unclaimed, 999_999]) {
            const response = await testRequest(
                app,
                `/api/community/exchange/me/quick?targetCard=${number}`,
                { headers: authHeaders('collector') },
            );
            assert.equal(response.status, 404);
            assert.deepEqual(await response.json(), { error: '找不到这位制作人' });
        }
    });

    postgresTest('the candidate list refuses two target sources at once', async () => {
        const { app, publish, authHeaders } = await fixture();
        const ownerCard = await publish('owner-targetcard-conflict', 'owner', 'auto');

        const conflict = await testRequest(
            app,
            `/api/community/exchange/me/quick?target=owner&targetCard=${ownerCard}`,
            { headers: authHeaders('collector') },
        );
        assert.equal(conflict.status, 400);
        assert.deepEqual(await conflict.json(), { error: '目标用户标识无效' });

        // 非数字的卡号在查询参数校验就拦下，不会走到 `findApprovedCard`。
        const malformed = await testRequest(
            app,
            '/api/community/exchange/me/quick?targetCard=card-1',
            { headers: authHeaders('collector') },
        );
        assert.equal(malformed.status, 400);
        assert.deepEqual(await malformed.json(), { error: '目标用户标识无效' });
    });

    postgresTest('the candidate read keeps its session guard and refuses a blank target', async () => {
        const { app, publish, authHeaders } = await fixture();
        await publish('collector-guard', 'collector', 'auto');

        // `platformAuth` 没变：没有会话就是 401，跟带不带 `target` 无关。
        assert.equal((await testRequest(app, '/api/community/exchange/me/quick')).status, 401);
        assert.equal(
            (await testRequest(app, '/api/community/exchange/me/quick?target=owner')).status,
            401,
        );
        // 只有空白的目标标志在查询参数校验就被拦下。
        const blank = await testRequest(app, '/api/community/exchange/me/quick?target=%20', {
            headers: authHeaders('collector'),
        });
        assert.equal(blank.status, 400);
        assert.deepEqual(await blank.json(), { error: '目标用户标识无效' });
    });

    postgresTest('the owner gets one stable share slug per card', async () => {
        const { app, publish, authHeaders } = await fixture();
        const number = await publish('owner-share-link', 'owner', 'auto');
        const request = (account: 'collector' | 'owner' | null) =>
            testRequest(app, `/api/community/exchange/me/cards/${number}/share-link`, {
                headers: account ? authHeaders(account) : {},
            });

        const first = await assertContractJson(
            await request('owner'),
            200,
            namecardCardShareLinkSchema,
        );
        assert.match(first.slug, /^[a-z0-9]{12}$/);
        // 幂等：重复调用返回同一个 slug。
        const second = await assertContractJson(
            await request('owner'),
            200,
            namecardCardShareLinkSchema,
        );
        assert.equal(second.slug, first.slug);
        // 拿到的 slug 就是分享页读的那把。
        const share = await testRequest(app, `/api/community/exchange/card/${first.slug}`);
        assert.equal(share.status, 200, await share.clone().text());

        // 别人的卡与不存在的卡一样：404，不区分原因。
        const foreign = await request('collector');
        assert.equal(foreign.status, 404);
        assert.deepEqual(await foreign.json(), { error: '找不到这张名片' });
        const ghost = await testRequest(
            app,
            '/api/community/exchange/me/cards/999999999999/share-link',
            { headers: authHeaders('owner') },
        );
        assert.equal(ghost.status, 404);
        // 未登录拿不到属主视角。
        assert.equal((await request(null)).status, 401);
    });

    postgresTest('the site share page injects per-card OGP tags into the SPA shell', async () => {
        const { app, publish, namecards } = await fixture();
        await publish('owner-ogp', 'owner', 'auto');
        const slug = await namecards.ensureExchangeLink('owner-ogp');

        const response = await testRequest(app, `/exchange/card/${slug}`);
        assert.equal(response.status, 200, await response.clone().text());
        assert.match(response.headers.get('content-type') ?? '', /^text\/html; charset=UTF-8$/);
        assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
        const html = await response.text();
        // 站点默认 title 被换成逐卡 title，且只留一套标签。
        assert.equal((html.match(/<title/g) ?? []).length, 1);
        assert.ok(html.includes('<title>Producer owner的名片 · IMS</title>'), html.slice(0, 400));
        assert.ok(!html.includes('偶像大师交流站'));
        assert.ok(
            html.includes(
                `<meta property="og:url" content="http://ims.test/exchange/card/${slug}">`,
            ),
        );
        // 正面缩略图是相对地址，注入时必须补成站外抓得到的绝对地址。
        assert.match(
            html,
            /<meta property="og:image" content="http:\/\/ims\.test\/api\/community\/exchange\/cards\/[^"]+">/,
        );
        assert.ok(html.includes('<meta property="og:image:width" content="400">'));

        // 找不到的 slug 仍然出页面（200），只是换成通用标签、没有图。
        const missing = await testRequest(app, '/exchange/card/zzzzzzzzzzzz');
        assert.equal(missing.status, 200, await missing.clone().text());
        const missingHtml = await missing.text();
        assert.ok(missingHtml.includes('<title>IMSWeb | 偶像大师交流站</title>'));
        assert.ok(!missingHtml.includes('og:image'));
    });

    /* ---- 属主清单布局（doc §5；任务 design-owner-card-manager） ---- */

    postgresTest('the layout saves groups, order, quick list and card settings at once', async () => {
        const { database, putLayout, publish } = await fixture();
        const first = await publish('owner-layout-1', 'owner', 'auto');
        const second = await publish('owner-layout-2', 'owner', 'auto');

        const saved = await putLayout('owner', {
            groups: [{ id: null, title: '常用', cardNumbers: [second] }],
            defaultCardNumbers: [first],
            quickCardNumbers: [second],
            cardSettings: [{ cardId: 'owner-layout-1', visible: false }],
        });
        assert.equal(saved.status, 200, await saved.clone().text());
        const body = (await saved.json()) as {
            groups: Array<{ id: string; title: string; cardNumbers: number[] }>;
            defaultCardNumbers: number[];
            quickCardNumbers: number[];
            limit: number;
        };
        assert.equal(body.groups.length, 1);
        assert.equal(body.groups[0]?.title, '常用');
        assert.ok(body.groups[0]?.id, '新分组要拿到服务端分配的 id');
        assert.deepEqual(body.groups[0]?.cardNumbers, [second]);
        assert.deepEqual(body.defaultCardNumbers, [first]);
        assert.deepEqual(body.quickCardNumbers, [second]);
        assert.equal(body.limit, NAMECARD_EXCHANGE_CARD_LIMIT);

        // 可见性是免审字段：保存即生效。
        const [invisible] = await queryAll<{ visible: boolean }>(
            database,
            'SELECT visible FROM fudaba_cards WHERE id=?',
            ['owner-layout-1'],
        );
        assert.equal(invisible?.visible, false);
        const quick = await queryAll<{ card_id: string }>(
            database,
            'SELECT card_id FROM namecard_quick_exchange_cards WHERE account_id=?',
            ['owner'],
        );
        assert.deepEqual(quick.map((row) => row.card_id), ['owner-layout-2']);
    });

    postgresTest('a card created after the save joins the top of the default group', async () => {
        const { getLayout, putLayout, publish } = await fixture();
        const older = await publish('owner-layout-old', 'owner', 'auto');
        assert.equal(
            (await putLayout('owner', {
                groups: [],
                defaultCardNumbers: [older],
                quickCardNumbers: [],
                cardSettings: [],
            })).status,
            200,
        );
        const newer = await publish('owner-layout-new', 'owner', 'auto');
        const state = (await (await getLayout('owner')).json()) as {
            defaultCardNumbers: number[];
        };
        assert.deepEqual(state.defaultCardNumbers, [newer, older]);
    });

    postgresTest('the layout rejects foreign numbers and duplicates without touching state', async () => {
        const { getLayout, putLayout, publish } = await fixture();
        const mine = await publish('owner-layout-mine', 'owner', 'auto');
        const theirs = await publish('collector-layout-theirs', 'collector', 'auto');
        assert.equal(
            (await putLayout('owner', {
                groups: [],
                defaultCardNumbers: [mine],
                quickCardNumbers: [],
                cardSettings: [],
            })).status,
            200,
        );

        const foreign = await putLayout('owner', {
            groups: [],
            defaultCardNumbers: [theirs],
            quickCardNumbers: [],
            cardSettings: [],
        });
        assert.equal(foreign.status, 400);
        assert.match(await foreign.text(), /不属于你/);

        const duplicated = await putLayout('owner', {
            groups: [],
            defaultCardNumbers: [mine, mine],
            quickCardNumbers: [],
            cardSettings: [],
        });
        assert.equal(duplicated.status, 400);
        assert.match(await duplicated.text(), /出现了多次/);

        const state = (await (await getLayout('owner')).json()) as {
            defaultCardNumbers: number[];
        };
        assert.deepEqual(state.defaultCardNumbers, [mine]);
    });

    postgresTest('the quick list only takes published automatic cards', async () => {
        const { putLayout, publish } = await fixture();
        const manual = await publish('owner-layout-manual', 'owner', 'manual');
        const automatic = await publish('owner-layout-auto', 'owner', 'auto');

        const rejected = await putLayout('owner', {
            groups: [],
            defaultCardNumbers: [manual, automatic],
            quickCardNumbers: [manual],
            cardSettings: [],
        });
        assert.equal(rejected.status, 400);
        assert.match(await rejected.text(), /自动交换/);

        // 同一份请求里先改成 auto 的卡可以直接进清单。
        const accepted = await putLayout('owner', {
            groups: [],
            defaultCardNumbers: [manual, automatic],
            quickCardNumbers: [manual],
            cardSettings: [{ cardId: 'owner-layout-manual', exchangeMode: 'auto' }],
        });
        assert.equal(accepted.status, 200, await accepted.clone().text());
    });

    postgresTest('group cards keep their fixed visibility and mode', async () => {
        const { database, putLayout, publish } = await fixture();
        await publish('owner-layout-group', 'owner', 'auto');
        await executeSql(database, 'UPDATE fudaba_cards SET is_group_card=true WHERE id=?', [
            'owner-layout-group',
        ]);
        const response = await putLayout('owner', {
            groups: [],
            defaultCardNumbers: [],
            quickCardNumbers: [],
            cardSettings: [{ cardId: 'owner-layout-group', visible: false }],
        });
        assert.equal(response.status, 400);
        assert.match(await response.text(), /团体名片/);
    });

    postgresTest('empty groups are dropped and hidden cards leave the layout', async () => {
        const { getLayout, putLayout, publish, setCardStatus } = await fixture();
        const kept = await publish('owner-layout-kept', 'owner', 'auto');
        const gone = await publish('owner-layout-gone', 'owner', 'auto');
        const saved = await putLayout('owner', {
            groups: [
                { id: null, title: '常用', cardNumbers: [kept] },
                { id: null, title: '空组', cardNumbers: [] },
            ],
            defaultCardNumbers: [gone],
            quickCardNumbers: [],
            cardSettings: [],
        });
        assert.equal(saved.status, 200, await saved.clone().text());
        const body = (await saved.json()) as {
            groups: Array<{ id: string; title: string }>;
        };
        assert.deepEqual(body.groups.map((group) => group.title), ['常用']);

        // 分组里唯一的卡被持有者下线 → 该组在读取侧消失。
        await setCardStatus('owner-layout-kept', 'hidden');
        const state = (await (await getLayout('owner')).json()) as {
            groups: unknown[];
        };
        assert.deepEqual(state.groups, []);
    });

    postgresTest('the public profile follows the layout and reports its groups', async () => {
        const { app, putLayout, publish } = await fixture();
        const first = await publish('owner-profile-1', 'owner', 'auto');
        const second = await publish('owner-profile-2', 'owner', 'auto');
        assert.equal(
            (await putLayout('owner', {
                groups: [{ id: null, title: '精选', cardNumbers: [first] }],
                defaultCardNumbers: [second],
                quickCardNumbers: [],
                cardSettings: [],
            })).status,
            200,
        );
        const response = await testRequest(app, '/api/users/owner/cards');
        assert.equal(response.status, 200, await response.clone().text());
        const body = (await response.json()) as {
            list: Array<{ cardNumber: number }>;
            groups?: Array<{ title: string; cardNumbers: number[] }>;
        };
        assert.deepEqual(
            body.list.map((card) => card.cardNumber),
            [second, first],
        );
        assert.deepEqual(body.groups, [{ title: '精选', cardNumbers: [first] }]);
    });

    postgresTest('the public profile reports the page count of multi-page cards', async () => {
        const { app, publish } = await fixture();
        // 页数 = 正面 + 中间页 + 背面；徽标只在超过两张时出现（判断在前端）。
        const single = await publish('owner-profile-single', 'owner', 'auto', [
            cardPageWrite('front'),
        ]);
        const double = await publish('owner-profile-double', 'owner', 'auto', [
            cardPageWrite('front'),
            cardPageWrite('back'),
        ]);
        const triple = await publish('owner-profile-triple', 'owner', 'auto', [
            cardPageWrite('front'),
            // 中间页的 page id 有格式约束，见迁移里的 `fudaba_card_pages_page_id_check`。
            cardPageWrite('page-abcdef12'),
            cardPageWrite('back'),
        ]);
        const response = await testRequest(app, '/api/users/owner/cards');
        assert.equal(response.status, 200, await response.clone().text());
        const body = (await response.json()) as {
            list: Array<{ cardNumber: number; pageCount?: number }>;
        };
        const counts = new Map(
            body.list.map((row) => [row.cardNumber, row.pageCount]),
        );
        assert.deepEqual(
            [single, double, triple].map((number) => counts.get(number)),
            [1, 2, 3],
        );
    });

    postgresTest('the public profile marks the cards the viewer already holds', async () => {
        const { app, publish, commit, authHeaders, namecards } = await fixture();
        const held = await publish('owner-profile-held', 'owner', 'auto');
        const fresh = await publish('owner-profile-fresh', 'owner', 'auto');
        // 浏览者通过一次交换拿到其中一张，另一张没拿。
        await commit({
            id: UUID.profileCollected,
            clientExchangeId: 'client-profile-collected-1',
            source: 'quick',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [held],
        });
        // 「已交换」不看名片册的隐藏状态：与交换系统的 `already-owned` 同口径。
        await namecards.setCollectionHidden({
            accountId: 'collector',
            cardNumber: held,
            hidden: true,
            at: AT,
        });

        const viewer = await assertContractJson(
            await testRequest(app, '/api/users/owner/cards', {
                headers: authHeaders('collector'),
            }),
            200,
            namecardPageSchema,
        );
        const rows = new Map(viewer.list.map((row) => [row.cardNumber, row]));
        assert.equal(rows.get(held)?.collected, true);
        // 没拿到的卡整份省略该字段，而不是写 `false`。
        assert.equal('collected' in (rows.get(fresh) ?? {}), false);

        // 未登录浏览不查名片册：字段一律不出现。
        const anonymous = await assertContractJson(
            await testRequest(app, '/api/users/owner/cards'),
            200,
            namecardPageSchema,
        );
        assert.deepEqual(
            anonymous.list.map((row) => 'collected' in row),
            [false, false],
        );
    });

    postgresTest('a batch change rides along a queued revision instead of being reverted', async () => {
        const { database, putLayout, publish } = await fixture();
        const number = await publish('owner-layout-pending', 'owner', 'auto');
        // 模拟「这张卡还有排队的修订」：审核通过时 `publishStagedRevision` 会用这份 payload
        // 整份覆盖 live 列，所以批量改动必须同时并进 payload，否则那一刻被静默回滚。
        await executeSql(
            database,
            `UPDATE fudaba_cards
                SET pending_payload = jsonb_build_object(
                    'producer_name', '旧值', 'visible', true, 'exchange_mode', 'auto')
              WHERE id=?`,
            ['owner-layout-pending'],
        );

        assert.equal(
            (await putLayout('owner', {
                groups: [{ id: null, title: '常用', cardNumbers: [number] }],
                defaultCardNumbers: [],
                quickCardNumbers: [],
                cardSettings: [
                    {
                        cardId: 'owner-layout-pending',
                        visible: false,
                        exchangeMode: 'manual',
                    },
                ],
            })).status,
            200,
        );

        const [row] = await queryAll<{
            visible: boolean;
            exchange_mode: string;
            pending_payload: Record<string, unknown>;
        }>(
            database,
            'SELECT visible, exchange_mode, pending_payload FROM fudaba_cards WHERE id=?',
            ['owner-layout-pending'],
        );
        assert.equal(row?.visible, false);
        assert.equal(row?.exchange_mode, 'manual');
        assert.equal(row?.pending_payload?.visible, false);
        assert.equal(row?.pending_payload?.exchange_mode, 'manual');
        // payload 里别的字段原样保留。
        assert.equal(row?.pending_payload?.producer_name, '旧值');
    });

    postgresTest('the quick list refuses a card that has no public page', async () => {
        const { database, putLayout, publish } = await fixture();
        const number = await publish('owner-layout-nopage', 'owner', 'auto');
        // 卡片仍 `published + auto`，只是没有线上页（`NAMECARD_PUBLIC_ORIGIN`），
        // 读侧会把它过滤掉——写入侧必须同口径，否则就是「保存成功但清单里没有」。
        await executeSql(
            database,
            'DELETE FROM public.fudaba_card_pages WHERE card_id=?',
            ['owner-layout-nopage'],
        );

        const refused = await putLayout('owner', {
            groups: [],
            defaultCardNumbers: [],
            quickCardNumbers: [number],
            cardSettings: [],
        });
        assert.equal(refused.status, 400);
        assert.deepEqual(await refused.json(), {
            error: '快速交换清单只收已发布且自动交换的名片',
        });
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

/* ---- 交换生命周期收口：过期 / 去重 / none / 通知 / 详情（任务 11-18 design §13） ---- */

describe('namecard exchange lifecycle', () => {
    postgresTest('a request older than a week reads as expired and settles as expired', async () => {
        const { database, namecards, publish, commit } = await fixture();
        const ownerNumber = await publish('owner-expire', 'owner', 'manual');
        const first = await commit({
            id: UUID.expire,
            clientExchangeId: 'client-expire-0001',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });
        assert.equal(first.exchange.status, 'pending');

        // 过期只跟 `created_at` 有关：直接把行改成 8 天前，不 mock 时钟。
        await executeSql(
            database,
            `UPDATE public.namecard_exchanges
                SET created_at = now() - interval '8 days'
              WHERE id=?`,
            [UUID.expire],
        );

        // 读取侧只投影、不写库。
        const listed = await namecards.listExchanges({
            accountId: 'owner',
            limit: 10,
            offset: 0,
        });
        assert.equal(listed.total, 1);
        assert.equal(listed.rows[0]?.status, 'expired');
        const [raw] = await queryAll<{ status: string; resolved_at: unknown }>(
            database,
            'SELECT status, resolved_at FROM public.namecard_exchanges WHERE id=?',
            [UUID.expire],
        );
        assert.equal(raw?.status, 'pending');
        assert.equal(raw?.resolved_at, null);

        // 过期 pending 不挡新请求：同一批卡再发起就是一行新的 pending。
        const again = await commit({
            id: UUID.expireRetry,
            clientExchangeId: 'client-expire-0002',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
        });
        assert.equal(again.idempotent, false);
        assert.notEqual(again.exchange.id, UUID.expire);
        assert.equal(again.exchange.status, 'pending');

        // 两封 requested 通知都带自己的 exchange id（R9 的前置）。
        const requested = await queryAll<{ kind: string; exchange_id: string | null }>(
            database,
            `SELECT kind, exchange_id FROM public.namecard_notifications
              WHERE recipient_account_id=?
              ORDER BY created_at, id`,
            ['owner'],
        );
        assert.deepEqual(
            requested.map((row) => row.kind),
            ['card-exchange-requested', 'card-exchange-requested'],
        );
        assert.deepEqual(
            requested.map((row) => row.exchange_id).sort(),
            [UUID.expire, UUID.expireRetry].sort(),
        );

        // 裁决命中的是过期 pending：顺手落成终态，并告诉调用方这是「过期」而不是「处理过了」。
        assert.deepEqual(
            await namecards.decideExchange({
                exchangeId: UUID.expire,
                accountId: 'owner',
                decision: 'accept',
                at: AT,
            }),
            { status: 'expired', stale: true },
        );
        const [settled] = await queryAll<{ status: string; resolved_at: unknown }>(
            database,
            'SELECT status, resolved_at FROM public.namecard_exchanges WHERE id=?',
            [UUID.expire],
        );
        assert.equal(settled?.status, 'expired');
        assert.ok(settled?.resolved_at, '过期必须同时写 resolved_at，满足 resolved_at IS NULL ⇔ pending');

        // 超时只通知发起方：目标方的收件箱里还是只有那两封 pending 请求。
        assert.equal(
            (
                await queryAll<{ id: string }>(
                    database,
                    `SELECT id FROM public.namecard_notifications
                      WHERE recipient_account_id=? AND kind LIKE 'card-exchange-%'`,
                    ['owner'],
                )
            ).length,
            2,
        );
        const expiredNotices = await queryAll<{
            kind: string;
            title: string;
            body: string;
            exchange_id: string | null;
            read_at: unknown;
        }>(
            database,
            `SELECT kind, title, body, exchange_id, read_at
               FROM public.namecard_notifications
              WHERE recipient_account_id=? AND kind='card-exchange-expired'`,
            ['collector'],
        );
        assert.equal(expiredNotices.length, 1);
        assert.equal(expiredNotices[0]?.title, '名片交换请求已过期');
        assert.equal(
            expiredNotices[0]?.body,
            'Owner 未及时处理您的交换申请，本次名片交换自动关闭。',
        );
        assert.equal(expiredNotices[0]?.exchange_id, UUID.expire);
        assert.equal(expiredNotices[0]?.read_at, null);

        // 已经落成终态后再裁决：不是过期，而是「已经处理过了」。
        assert.deepEqual(
            await namecards.decideExchange({
                exchangeId: UUID.expire,
                accountId: 'owner',
                decision: 'accept',
                at: AT,
            }),
            { status: 'expired', stale: false },
        );
    });

    postgresTest('the decide endpoint distinguishes an expired request from a settled one', async () => {
        const { database, app, authHeaders, publish, commit } = await fixture();
        const staleNumber = await publish('owner-decide-stale', 'owner', 'manual');
        const settledNumber = await publish('owner-decide-settled', 'owner', 'manual');
        await commit({
            id: UUID.staleDecide,
            clientExchangeId: 'client-decide-stale',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [staleNumber],
        });
        // 同一对账号只保留一笔有效 pending：先把第一笔拨到 7 天外，第二笔才落成独立的一行。
        await executeSql(
            database,
            `UPDATE public.namecard_exchanges
                SET created_at = now() - interval '8 days'
              WHERE id=?`,
            [UUID.staleDecide],
        );
        await commit({
            id: UUID.settledDecide,
            clientExchangeId: 'client-decide-settled',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [settledNumber],
        });

        const decide = (id: string, decision: 'accept' | 'decline') =>
            testRequest(app, `/api/community/exchange/exchanges/${id}/${decision}`, {
                method: 'POST',
                headers: { ...authHeaders('owner'), 'content-type': 'application/json' },
                body: JSON.stringify({}),
            });

        const stale = await decide(UUID.staleDecide, 'accept');
        assert.equal(stale.status, 409);
        assert.deepEqual(await stale.json(), {
            error: '这条交换请求已过期，对方需要重新发起',
        });

        const accepted = await decide(UUID.settledDecide, 'accept');
        assert.equal(accepted.status, 200, await accepted.clone().text());
        assert.deepEqual(await accepted.json(), { success: true, status: 'completed' });
        const repeated = await decide(UUID.settledDecide, 'decline');
        assert.equal(repeated.status, 409);
        assert.deepEqual(await repeated.json(), {
            error: '这条交换请求已经处理过了',
        });
    });

    postgresTest('a repeated request keeps one pending row and one notification', async () => {
        const { database, namecards, publish, commit } = await fixture();
        const firstNumber = await publish('owner-dedupe-a', 'owner', 'manual');
        const secondNumber = await publish('owner-dedupe-b', 'owner', 'manual');

        const first = await commit({
            id: UUID.dedupeFirst,
            clientExchangeId: 'client-dedupe-0001',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [firstNumber],
        });
        const repeat = await commit({
            id: UUID.dedupeSecond,
            clientExchangeId: 'client-dedupe-0002',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [firstNumber],
        });
        assert.equal(first.idempotent, false);
        assert.equal(repeat.idempotent, true);
        assert.equal(repeat.exchange.id, UUID.dedupeFirst);
        assert.equal(
            (await namecards.listExchanges({ accountId: 'owner', limit: 10, offset: 0 })).total,
            1,
        );
        const sent = await queryAll<{ exchange_id: string | null }>(
            database,
            `SELECT exchange_id FROM public.namecard_notifications
              WHERE recipient_account_id=? AND kind='card-exchange-requested'`,
            ['owner'],
        );
        assert.deepEqual(
            sent.map((row) => row.exchange_id),
            [UUID.dedupeFirst],
        );

        // 换一批目标卡不是第二次申请：同一笔 pending 被原地覆盖，id 不变、通知不多一封。
        const changed = await commit({
            id: UUID.dedupeThird,
            clientExchangeId: 'client-dedupe-0003',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [firstNumber, secondNumber],
        });
        assert.equal(changed.idempotent, false);
        assert.equal(changed.exchange.id, UUID.dedupeFirst);
        assert.deepEqual(
            [...changed.exchange.target_card_numbers].sort((left, right) => left - right),
            [firstNumber, secondNumber].sort((left, right) => left - right),
        );
        assert.equal(
            (await namecards.listExchanges({ accountId: 'owner', limit: 10, offset: 0 })).total,
            1,
        );
        const refreshed = await queryAll<{ exchange_id: string | null; body: string }>(
            database,
            `SELECT exchange_id, body FROM public.namecard_notifications
              WHERE recipient_account_id=? AND kind='card-exchange-requested'`,
            ['owner'],
        );
        assert.equal(refreshed.length, 1);
        assert.equal(refreshed[0]?.exchange_id, UUID.dedupeFirst);
        assert.match(refreshed[0]?.body ?? '', new RegExp(`#${firstNumber}`));
        assert.match(refreshed[0]?.body ?? '', new RegExp(`#${secondNumber}`));
    });

    postgresTest('changing the cards overwrites the pending row and refreshes its notification', async () => {
        const { database, namecards, publish } = await fixture();
        const firstTarget = await publish('owner-overwrite-a', 'owner', 'manual');
        const secondTarget = await publish('owner-overwrite-b', 'owner', 'manual');
        const firstGive = await publish('collector-overwrite-a', 'collector', 'auto');
        const secondGive = await publish('collector-overwrite-b', 'collector', 'auto');
        const later = new Date(Date.parse(AT) + 60_000).toISOString();

        const first = await namecards.commitExchange({
            id: UUID.overwriteFirst,
            clientExchangeId: 'client-overwrite-0001',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [firstTarget],
            giveCardNumbers: [firstGive],
            scanSessionId: null,
            at: AT,
        });
        assert.equal(first.exchange.status, 'pending');
        const [before] = await queryAll<{ id: string; body: string }>(
            database,
            `SELECT id, body FROM public.namecard_notifications
              WHERE recipient_account_id=? AND kind='card-exchange-requested'`,
            ['owner'],
        );
        assert.ok(before);
        assert.ok(before.body.includes(`#${firstTarget}`));
        // 对方已经读过这条请求；覆盖之后它要重新变成未读。
        await executeSql(
            database,
            'UPDATE public.namecard_notifications SET read_at=CURRENT_TIMESTAMP WHERE id=?',
            [before.id],
        );

        const overwritten = await namecards.commitExchange({
            id: UUID.overwriteSecond,
            clientExchangeId: 'client-overwrite-0002',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [secondTarget],
            giveCardNumbers: [secondGive],
            scanSessionId: null,
            at: later,
        });
        assert.equal(overwritten.idempotent, false);
        assert.equal(overwritten.exchange.id, UUID.overwriteFirst);
        assert.equal(overwritten.exchange.status, 'pending');
        assert.deepEqual(overwritten.exchange.target_card_numbers, [secondTarget]);
        assert.deepEqual(overwritten.exchange.initiator_card_numbers, [secondGive]);

        // 同一行通知：卡号与正文换成最新一次，重新未读，不新增第二封。
        const after = await queryAll<{
            id: string;
            body: string;
            read_at: unknown;
            exchange_id: string | null;
        }>(
            database,
            `SELECT id, body, read_at, exchange_id FROM public.namecard_notifications
              WHERE recipient_account_id=? AND kind='card-exchange-requested'`,
            ['owner'],
        );
        assert.equal(after.length, 1);
        assert.equal(after[0]?.id, before.id);
        assert.equal(after[0]?.exchange_id, UUID.overwriteFirst);
        assert.equal(after[0]?.read_at, null);
        assert.ok(after[0]?.body.includes(`#${secondTarget}`));
        assert.ok(!(after[0]?.body ?? '').includes(`#${firstTarget}`));

        // 有效期跟着 `created_at` 重置；详情窗口直接读到的就是最新内容。
        const detail = await namecards.findExchangeDetail({
            exchangeId: UUID.overwriteFirst,
            accountId: 'owner',
        });
        assert.ok(detail);
        assert.equal(new Date(detail.created_at).getTime(), Date.parse(later));
        assert.equal(
            Date.parse(detail.expires_at ?? '') - new Date(detail.created_at).getTime(),
            NAMECARD_EXCHANGE_PENDING_TTL_MS,
        );
        assert.ok(
            Date.parse(detail.expires_at ?? '') >
                new Date(first.exchange.created_at).getTime() +
                    NAMECARD_EXCHANGE_PENDING_TTL_MS,
        );
        assert.deepEqual(
            detail.target_cards.map((card) => card.card_number),
            [secondTarget],
        );
        assert.deepEqual(
            detail.initiator_cards.map((card) => card.card_number),
            [secondGive],
        );
    });

    postgresTest('every exchange notification carries its exchange id into the inbox', async () => {
        const { database, app, authHeaders, namecards, publish, commit } = await fixture();
        const acceptedNumber = await publish('owner-notify-accepted', 'owner', 'manual');
        const declinedNumber = await publish('owner-notify-declined', 'owner', 'manual');
        // 同一对账号只保留一笔 pending：先裁决前一笔，再发起后一笔，两封结果通知才各有归属。
        await commit({
            id: UUID.notifyRequested,
            clientExchangeId: 'client-notify-0001',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [acceptedNumber],
        });
        await namecards.decideExchange({
            exchangeId: UUID.notifyRequested,
            accountId: 'owner',
            decision: 'accept',
            at: AT,
        });
        await commit({
            id: UUID.notifyDeclined,
            clientExchangeId: 'client-notify-0002',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [declinedNumber],
        });
        await namecards.decideExchange({
            exchangeId: UUID.notifyDeclined,
            accountId: 'owner',
            decision: 'decline',
            at: AT,
        });

        const rows = await queryAll<{ kind: string; exchange_id: string | null }>(
            database,
            'SELECT kind, exchange_id FROM public.namecard_notifications',
        );
        assert.equal(rows.find((row) => row.kind === 'card-exchange-accepted')?.exchange_id, UUID.notifyRequested);
        assert.equal(rows.find((row) => row.kind === 'card-exchange-declined')?.exchange_id, UUID.notifyDeclined);
        assert.deepEqual(
            rows
                .filter((row) => row.kind === 'card-exchange-requested')
                .map((row) => row.exchange_id)
                .sort(),
            [UUID.notifyRequested, UUID.notifyDeclined].sort(),
        );

        // 列表接口原样带出 `exchangeId`（契约必填可空）。
        const inbox = await assertContractJson(
            await testRequest(app, '/api/community/exchange/me/notifications', {
                headers: authHeaders('collector'),
            }),
            200,
            namecardNotificationListResponseSchema,
        );
        assert.equal(inbox.items.length, 2);
        const byKind = new Map(inbox.items.map((item) => [item.kind, item.exchangeId]));
        assert.equal(byKind.get('card-exchange-accepted'), UUID.notifyRequested);
        assert.equal(byKind.get('card-exchange-declined'), UUID.notifyDeclined);
    });

    postgresTest('a none card refuses a direct request and a share commit', async () => {
        const { namecards, app, authHeaders, publish } = await fixture();
        const cardNumber = await publish('owner-none-reject', 'owner', 'none');
        const body = JSON.stringify({
            clientExchangeId: 'client-none-reject-1',
            giveCardNumbers: [],
        });

        const request = await testRequest(
            app,
            `/api/community/exchange/cards/${cardNumber}/request`,
            {
                method: 'POST',
                headers: { ...authHeaders('collector'), 'content-type': 'application/json' },
                body,
            },
        );
        assert.equal(request.status, 409, await request.clone().text());
        assert.deepEqual(await request.json(), { error: '这张名片不接受交换' });

        const slug = await namecards.ensureExchangeLink('owner-none-reject');
        const share = await testRequest(app, `/api/community/exchange/card/${slug}/commit`, {
            method: 'POST',
            headers: { ...authHeaders('collector'), 'content-type': 'application/json' },
            body,
        });
        assert.equal(share.status, 409, await share.clone().text());
        assert.deepEqual(await share.json(), { error: '这张名片不接受交换' });

        // 被拒绝得干脆，也不该留下一次空交换。
        assert.equal(
            (await namecards.listExchanges({ accountId: 'collector', limit: 10, offset: 0 })).total,
            0,
        );
    });

    postgresTest('both sides can read the exchange detail and nobody else can', async () => {
        const { app, authHeaders, namecards, publish, commit } = await fixture();
        const ownerNumber = await publish('owner-detail', 'owner', 'manual');
        const giveNumber = await publish('collector-detail', 'collector', 'auto');
        await commit({
            id: UUID.detail,
            clientExchangeId: 'client-detail-0001',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [ownerNumber],
            giveCardNumbers: [giveNumber],
        });

        const read = (accountId: 'collector' | 'owner' | 'stranger') =>
            testRequest(app, `/api/community/exchange/exchanges/${UUID.detail}`, {
                headers: authHeaders(accountId),
            });

        const asOwner = await assertContractJson(
            await read('owner'),
            200,
            namecardExchangeDetailSchema,
        );
        assert.equal(asOwner.status, 'pending');
        assert.equal(asOwner.source, 'card-request');
        assert.equal(asOwner.initiator.accountId, 'collector');
        assert.equal(asOwner.initiator.displayName, 'Collector');
        assert.equal(asOwner.target.accountId, 'owner');
        assert.equal(asOwner.target.displayName, 'Owner');
        assert.deepEqual(
            asOwner.targetCards.map((card) => card.cardNumber),
            [ownerNumber],
        );
        assert.deepEqual(
            asOwner.initiatorCards.map((card) => card.cardNumber),
            [giveNumber],
        );
        // 卡片与分享页同一份投影：缩略图必须是交换作用域的路由地址。
        const pages = asOwner.targetCards[0]?.pages ?? [];
        assert.ok(pages.length > 0, '详情没有页面地址');
        for (const page of pages) {
            assert.match(page.thumbUrl, /^\/api\/community\/exchange\/cards\//);
        }
        // `expiresAt` = createdAt + 7 天；pending 才有值。
        assert.equal(
            Date.parse(asOwner.expiresAt ?? '') - Date.parse(asOwner.createdAt),
            NAMECARD_EXCHANGE_PENDING_TTL_MS,
        );

        // 发起方也读得到同一笔（两侧卡片不因视角互换）。
        const asInitiator = await assertContractJson(
            await read('collector'),
            200,
            namecardExchangeDetailSchema,
        );
        assert.deepEqual(
            asInitiator.targetCards.map((card) => card.cardNumber),
            [ownerNumber],
        );

        // 第三方与不存在的 id 一律 404；未登录 401。
        assert.equal((await read('stranger')).status, 404);
        assert.equal(
            (
                await testRequest(
                    app,
                    '/api/community/exchange/exchanges/9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f',
                    { headers: authHeaders('owner') },
                )
            ).status,
            404,
        );
        assert.equal(
            (await testRequest(app, `/api/community/exchange/exchanges/${UUID.detail}`)).status,
            401,
        );
    });

    postgresTest('the detail reports an expired request and drops the stamp once settled', async () => {
        const { database, app, authHeaders, namecards, publish, commit } = await fixture();
        const expiredNumber = await publish('owner-detail-expired', 'owner', 'manual');
        const settledNumber = await publish('owner-detail-settled', 'owner', 'manual');
        await commit({
            id: UUID.detail,
            clientExchangeId: 'client-detail-expired',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [expiredNumber],
        });
        // 同一对账号只保留一笔有效 pending：过期那笔先离开有效期，第二笔才是独立的一行。
        await executeSql(
            database,
            `UPDATE public.namecard_exchanges
                SET created_at = now() - interval '8 days'
              WHERE id=?`,
            [UUID.detail],
        );
        await commit({
            id: UUID.detailSettled,
            clientExchangeId: 'client-detail-settled',
            source: 'card-request',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [settledNumber],
        });
        await namecards.decideExchange({
            exchangeId: UUID.detailSettled,
            accountId: 'owner',
            decision: 'accept',
            at: AT,
        });

        const expired = await assertContractJson(
            await testRequest(app, `/api/community/exchange/exchanges/${UUID.detail}`, {
                headers: authHeaders('owner'),
            }),
            200,
            namecardExchangeDetailSchema,
        );
        assert.equal(expired.status, 'expired');
        assert.equal(
            Date.parse(expired.expiresAt ?? '') - Date.parse(expired.createdAt),
            NAMECARD_EXCHANGE_PENDING_TTL_MS,
        );

        const settled = await assertContractJson(
            await testRequest(app, `/api/community/exchange/exchanges/${UUID.detailSettled}`, {
                headers: authHeaders('owner'),
            }),
            200,
            namecardExchangeDetailSchema,
        );
        assert.equal(settled.status, 'completed');
        assert.equal(settled.expiresAt, null);
    });
});

describe('namecard album queries over the route', () => {
    postgresTest('the route merges own cards and keeps the paging contract', async () => {
        const { app, authHeaders, publish, commit } = await fixture();
        const collected = await publish('album-route-collected', 'owner', 'auto');
        const own = await publish('album-route-own', 'collector', 'auto');
        await commit({
            id: UUID.albumRoute,
            clientExchangeId: 'client-album-route',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [collected],
        });

        // 只差一名片页：按制作人名正序时 `Producer collector` 先于 `Producer owner`。
        const page = await assertContractJson(
            await testRequest(
                app,
                '/api/community/exchange/me/collection?includeOwn=true&sort=name&dir=asc&page=1&size=1',
                { headers: authHeaders('collector') },
            ),
            200,
            namecardCollectionPageSchema,
        );
        assert.equal(page.total, 2);
        assert.equal(page.totalPage, 2);
        assert.equal(page.list.length, 1);
        assert.equal(page.list[0]?.cardNumber, own);
        assert.equal(page.list[0]?.own, true);
        // 自己的名片没有交换时间：回退名片创建时间（夹具的 `AT`）。
        assert.equal(page.list[0]?.obtainedAt, AT);

        // 第二页只有收到的那张，并且不带 `own`。
        const second = await assertContractJson(
            await testRequest(
                app,
                '/api/community/exchange/me/collection?includeOwn=true&sort=name&dir=asc&page=2&size=1',
                { headers: authHeaders('collector') },
            ),
            200,
            namecardCollectionPageSchema,
        );
        assert.equal(second.list[0]?.cardNumber, collected);
        assert.equal(second.list[0]?.own, false);
    });

    postgresTest('the route parses declaration and inverts the content filters', async () => {
        const { app, authHeaders, publish, commit, database } = await fixture();
        const original = await publish('album-declaration-original', 'owner');
        const ai = await publish('album-declaration-ai', 'owner');
        const plain = await publish('album-declaration-plain', 'owner');
        await executeSql(
            database,
            'UPDATE fudaba_cards SET is_original=TRUE WHERE id=?',
            ['album-declaration-original'],
        );
        await executeSql(
            database,
            'UPDATE fudaba_cards SET made_with_ai=TRUE WHERE id=?',
            ['album-declaration-ai'],
        );
        await commit({
            id: UUID.albumDeclaration,
            clientExchangeId: 'client-album-declaration',
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [original, ai, plain],
        });

        const album = async (query: string) =>
            assertContractJson(
                await testRequest(
                    app,
                    `/api/community/exchange/me/collection?${query}`,
                    { headers: authHeaders('collector') },
                ),
                200,
                namecardCollectionPageSchema,
            );
        // 同一交换写入的条目时间相同，倒序按名片编号兜底：plain, ai, original。
        assert.deepEqual(
            (await album('declaration=original')).list.map((entry) => entry.cardNumber),
            [original],
        );
        assert.deepEqual(
            (await album('declaration=ai')).list.map((entry) => entry.cardNumber),
            [ai],
        );
        assert.deepEqual(
            (await album('declaration=original&invert=true')).list.map(
                (entry) => entry.cardNumber,
            ),
            [plain, ai],
        );
        // 没有内容条件时取反等价于不筛。
        assert.deepEqual(
            (await album('invert=true')).list.map((entry) => entry.cardNumber),
            [plain, ai, original],
        );
        const rejected = await testRequest(
            app,
            '/api/community/exchange/me/collection?declaration=unknown',
            { headers: authHeaders('collector') },
        );
        assert.equal(rejected.status, 400);
    });

    postgresTest('the album route rejects malformed filters and the history route stays page-only', async () => {
        const { app, authHeaders } = await fixture();
        for (const query of [
            'size=0',
            'size=101',
            'page=0',
            'page=abc',
            'sort=bad',
            'dir=sideways',
            'character=0',
            'character=abc',
            'match=some',
            'includeOwn=maybe',
        ]) {
            const response = await testRequest(
                app,
                `/api/community/exchange/me/collection?${query}`,
                { headers: authHeaders('collector') },
            );
            assert.equal(response.status, 400, `${query} should be rejected`);
        }

        // 交换记录只有页码：名片册的筛选参数不该悄悄被它接受。
        const history = await testRequest(
            app,
            '/api/community/exchange/me/exchanges?page=1&size=10',
            { headers: authHeaders('collector') },
        );
        assert.equal(history.status, 200, await history.clone().text());
        const rejected = await testRequest(
            app,
            '/api/community/exchange/me/exchanges?sort=name',
            { headers: authHeaders('collector') },
        );
        assert.equal(rejected.status, 400);
    });
});

describe('namecard collection owner filter over the route', () => {
    postgresTest('the owner picker only lists card owners from my shelf plus myself', async () => {
        const { app, authHeaders, publish, commit, database } = await fixture();
        const fromOwner = await publish('picker-owner-a', 'owner', 'auto');
        const fromOwnerAgain = await publish('picker-owner-b', 'owner', 'auto');
        const fromStranger = await publish('picker-stranger', 'stranger', 'auto');
        for (const [cardNumber, target] of [
            [fromOwner, 'owner'],
            [fromOwnerAgain, 'owner'],
            [fromStranger, 'stranger'],
        ] as const) {
            await commit({
                id: randomUUID(),
                clientExchangeId: `client-${randomUUID()}`,
                source: 'card-share',
                initiatorAccountId: 'collector',
                targetAccountId: target,
                targetCardNumbers: [cardNumber],
            });
        }

        // 站内还有别的用户：没进过我的册子，不能出现在选单里。
        await executeSql(
            database,
            `INSERT INTO platform_accounts (id, status, created_at, updated_at)
             VALUES ('lurker', 'active', ?, ?)`,
            [AT_MS, AT_MS],
        );
        await executeSql(
            database,
            `INSERT INTO platform_profiles (account_id, display_name, updated_at)
             VALUES ('lurker', 'Lurker', ?)`,
            [AT_MS],
        );

        const owners = await assertContractJson(
            await testRequest(app, '/api/community/exchange/me/collection/owners', {
                headers: authHeaders('collector'),
            }),
            200,
            namecardCollectionOwnersSchema,
        );
        assert.deepEqual(owners.list.map((row) => row.accountId), [
            'collector',
            'owner',
            'stranger',
        ]);
        assert.deepEqual(owners.list.map((row) => row.displayName), [
            'Collector',
            'Owner',
            'Stranger',
        ]);
        assert.equal(owners.list[0]?.avatarUrl, null);
        assert.ok(
            owners.list.every((row) => Number.isInteger(row.uid) && row.uid > 0),
            '每个卡主都带正整数 uid',
        );

        // `q` 按显示名子串过滤，且不区分大小写。
        const searched = await assertContractJson(
            await testRequest(
                app,
                '/api/community/exchange/me/collection/owners?q=own',
                { headers: authHeaders('collector') },
            ),
            200,
            namecardCollectionOwnersSchema,
        );
        assert.deepEqual(searched.list.map((row) => row.displayName), ['Owner']);

        // `limit` 生效；顺序按显示名。
        const limited = await assertContractJson(
            await testRequest(
                app,
                '/api/community/exchange/me/collection/owners?limit=1',
                { headers: authHeaders('collector') },
            ),
            200,
            namecardCollectionOwnersSchema,
        );
        assert.deepEqual(limited.list.map((row) => row.displayName), ['Collector']);
        for (const query of ['limit=0', 'limit=51', 'limit=abc']) {
            const response = await testRequest(
                app,
                `/api/community/exchange/me/collection/owners?${query}`,
                { headers: authHeaders('collector') },
            );
            assert.equal(response.status, 400, query);
        }

        // 列表的 `owner` 筛选：两个卡主各回各的条目。
        const filtered = await assertContractJson(
            await testRequest(
                app,
                '/api/community/exchange/me/collection?owner=owner',
                { headers: authHeaders('collector') },
            ),
            200,
            namecardCollectionPageSchema,
        );
        assert.equal(filtered.total, 2);
        assert.deepEqual(
            filtered.list.map((row) => row.cardNumber).sort((left, right) => left - right),
            [fromOwner, fromOwnerAgain].sort((left, right) => left - right),
        );

        // `includeOwn` + `owner=自己`：自己的名片能被筛出来。
        const own = await publish('picker-own', 'collector', 'auto');
        const ownPage = await assertContractJson(
            await testRequest(
                app,
                '/api/community/exchange/me/collection?owner=collector&includeOwn=true',
                { headers: authHeaders('collector') },
            ),
            200,
            namecardCollectionPageSchema,
        );
        assert.equal(ownPage.total, 1);
        assert.equal(ownPage.list[0]?.cardNumber, own);
        assert.equal(ownPage.list[0]?.own, true);
    });

    postgresTest('the owner picker stays behind the platform session', async () => {
        const { app } = await fixture();
        const response = await testRequest(
            app,
            '/api/community/exchange/me/collection/owners',
        );
        assert.equal(response.status, 401);
    });
});

describe('namecard gift over the route', () => {
    postgresTest('a gift only fills the recipient shelf and records a silent completed exchange', async () => {
        const { app, authHeaders, publish, shelf, database } = await fixture();
        const first = await publish('gift-one', 'collector', 'auto');
        // 送出方不受交换模式限制：`none` 的卡也能送。
        const second = await publish('gift-two', 'collector', 'none');
        const response = await testRequest(
            app,
            '/api/community/exchange/users/owner/gift',
            {
                method: 'POST',
                headers: { ...authHeaders('collector'), 'content-type': 'application/json' },
                body: JSON.stringify({
                    clientExchangeId: 'client-gift-silent',
                    cardNumbers: [first, second],
                }),
            },
        );
        const result = await assertContractJson(
            response,
            200,
            namecardExchangeResultSchema,
        );
        const numbers = (values: readonly number[]) =>
            [...values].sort((left, right) => left - right);
        assert.equal(result.status, 'completed');
        assert.deepEqual(result.targetCardNumbers, []);
        assert.deepEqual(numbers(result.initiatorCardNumbers), numbers([first, second]));
        assert.deepEqual(result.skipped, []);

        const received = await shelf('owner');
        assert.equal(received.total, 2);
        assert.deepEqual(
            numbers(received.rows.map((row) => row.card_number)),
            numbers([first, second]),
        );
        // 入册时间就是提交时刻，不是名片创建时间（夹具创建时间固定在 `AT`）。
        const now = Date.now();
        for (const row of received.rows) {
            const obtainedAt = Date.parse(new Date(row.obtained_at).toISOString());
            assert.ok(Number.isFinite(obtainedAt));
            assert.ok(
                Math.abs(now - obtainedAt) < 60_000,
                `unexpected obtained_at ${row.obtained_at}`,
            );
        }
        // 发送方名片册不新增条目：这些卡本来就是自己的。
        assert.equal((await shelf('collector')).total, 0);

        const [exchange] = await queryAll<{
            source: string;
            status: string;
            target_cards: number | string;
            initiator_cards: number | string;
        }>(
            database,
            `SELECT source, status,
                    cardinality(target_card_numbers) AS target_cards,
                    cardinality(initiator_card_numbers) AS initiator_cards
               FROM public.namecard_exchanges
              WHERE client_exchange_id=?`,
            ['client-gift-silent'],
        );
        assert.equal(exchange?.source, 'gift');
        assert.equal(exchange?.status, 'completed');
        assert.equal(Number(exchange?.target_cards), 0);
        assert.equal(Number(exchange?.initiator_cards), 2);

        // 静默：双方都没有交换通知。
        const notices = await queryAll<{ id: string }>(
            database,
            `SELECT id FROM public.namecard_notifications
              WHERE recipient_account_id IN ('owner','collector')
                AND kind LIKE 'card-exchange-%'`,
        );
        assert.equal(notices.length, 0);

        // 受赠方的交换记录：incoming + completed + 没有目标卡。
        const history = await assertContractJson(
            await testRequest(app, '/api/community/exchange/me/exchanges', {
                headers: authHeaders('owner'),
            }),
            200,
            namecardExchangeHistoryPageSchema,
        );
        assert.equal(history.total, 1);
        assert.equal(history.list[0]?.source, 'gift');
        assert.equal(history.list[0]?.status, 'completed');
        assert.equal(history.list[0]?.direction, 'incoming');
        assert.equal(history.list[0]?.counterpart.accountId, 'collector');
        assert.deepEqual(history.list[0]?.targetCardNumbers, []);
    });

    postgresTest('owned and foreign cards are skipped while the rest still lands', async () => {
        const { app, authHeaders, publish, shelf, commit, database } = await fixture();
        const alreadyOwned = await publish('gift-owned', 'collector', 'auto');
        const fresh = await publish('gift-fresh', 'collector', 'auto');
        const foreign = await publish('gift-foreign', 'owner', 'auto');
        // 先让 owner 拥有 `alreadyOwned`，再送同一张。
        await commit({
            id: randomUUID(),
            clientExchangeId: `client-gift-seed-${randomUUID()}`,
            source: 'card-share',
            initiatorAccountId: 'collector',
            targetAccountId: 'owner',
            targetCardNumbers: [],
            giveCardNumbers: [alreadyOwned],
        });

        const response = await testRequest(
            app,
            '/api/community/exchange/users/owner/gift',
            {
                method: 'POST',
                headers: { ...authHeaders('collector'), 'content-type': 'application/json' },
                body: JSON.stringify({
                    clientExchangeId: 'client-gift-skip',
                    cardNumbers: [alreadyOwned, fresh, foreign],
                }),
            },
        );
        const result = await assertContractJson(
            response,
            200,
            namecardExchangeResultSchema,
        );
        assert.equal(result.status, 'completed');
        assert.deepEqual(result.initiatorCardNumbers, [fresh]);
        assert.deepEqual(
            [...result.skipped].sort((left, right) => left.cardNumber - right.cardNumber),
            [
                { cardNumber: alreadyOwned, side: 'initiator', reason: 'owned-by-target' },
                { cardNumber: foreign, side: 'initiator', reason: 'unavailable' },
            ].sort((left, right) => left.cardNumber - right.cardNumber),
        );

        // 已经拥有的那张保持原样，新的一张照常入册。
        const received = await shelf('owner');
        assert.equal(received.total, 2);
        assert.deepEqual(
            received.rows.map((row) => row.card_number).sort((left, right) => left - right),
            [alreadyOwned, fresh].sort((left, right) => left - right),
        );

        // 跳过原因落库，历史里能解释这次送礼做了什么。
        const [exchange] = await queryAll<{ skipped: unknown }>(
            database,
            `SELECT skipped FROM public.namecard_exchanges WHERE client_exchange_id=?`,
            ['client-gift-skip'],
        );
        assert.deepEqual(
            (exchange?.skipped as { cardNumber: number }[]).map((row) => row.cardNumber)
                .sort((left, right) => left - right),
            [alreadyOwned, foreign].sort((left, right) => left - right),
        );
    });

    postgresTest('the gift route rejects unknown, disabled, self and malformed requests', async () => {
        const { app, authHeaders, publish, database } = await fixture();
        const mine = await publish('gift-negative', 'collector', 'auto');
        const send = (
            accountId: string,
            body: unknown,
            options: { authenticated?: boolean } = {},
        ) =>
            testRequest(app, `/api/community/exchange/users/${accountId}/gift`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(options.authenticated === false ? {} : authHeaders('collector')),
                },
                body: JSON.stringify(body),
            });

        const unknown = await send('ghost', {
            clientExchangeId: 'client-gift-unknown',
            cardNumbers: [mine],
        });
        assert.equal(unknown.status, 404);
        assert.deepEqual(await unknown.json(), { error: '找不到这位制作人' });

        // 停用账号与不存在同口径。
        await executeSql(
            database,
            "UPDATE platform_accounts SET status='suspended' WHERE id='owner'",
        );
        const disabled = await send('owner', {
            clientExchangeId: 'client-gift-disabled',
            cardNumbers: [mine],
        });
        assert.equal(disabled.status, 404);
        assert.deepEqual(await disabled.json(), { error: '找不到这位制作人' });
        await executeSql(
            database,
            "UPDATE platform_accounts SET status='active' WHERE id='owner'",
        );

        const self = await send('collector', {
            clientExchangeId: 'client-gift-self',
            cardNumbers: [mine],
        });
        assert.equal(self.status, 400);
        assert.deepEqual(await self.json(), { error: '不能给自己送名片' });

        for (const body of [
            { clientExchangeId: 'client-gift-bad', cardNumbers: [] },
            {
                clientExchangeId: 'client-gift-bad',
                cardNumbers: Array.from(
                    { length: NAMECARD_EXCHANGE_CARD_LIMIT + 1 },
                    (_value, index) => index + 1,
                ),
            },
            { clientExchangeId: 'short', cardNumbers: [mine] },
            { clientExchangeId: 'client-gift-bad', cardNumbers: [mine], extra: true },
            { cardNumbers: [mine] },
        ]) {
            const response = await send('owner', body);
            assert.equal(response.status, 400, JSON.stringify(body));
        }

        const anonymous = await send(
            'owner',
            { clientExchangeId: 'client-gift-anon', cardNumbers: [mine] },
            { authenticated: false },
        );
        assert.equal(anonymous.status, 401);
    });
});
