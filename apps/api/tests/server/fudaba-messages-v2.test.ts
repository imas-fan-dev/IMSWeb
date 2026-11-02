import { insertBackofficeAccount } from '../fixtures/rows';
import sharp from 'sharp';
import { SharpImageProcessor } from '@/infra/media/sharp/image-processor';
import { createFudabaTinyPreview } from '@/domains/community/fudaba/card-preview';
import {
    fudabaWallLayoutResponseSchema,
    fudabaWallSceneResponseSchema,
} from '@imsweb/contracts/fudaba/messages';
import { createHonoApp } from '@/app';
import {
    fudabaMixedWallResponseSchema,
    fudabaMessageResponseSchema,
    fudabaMessageErrorResponseSchema,
    fudabaMessageListResponseSchema,
} from '@imsweb/contracts/fudaba/messages';
import { readContractJson } from '../contracts/contract-json';
import {
    bearerTokenHeaders,
    cookieCsrfHeaders,
    fixtureSha256Hex,
} from '../fixtures/auth-request';
import {
    PLATFORM_ACCESS_TOKEN_COOKIE,
    PLATFORM_CSRF_TOKEN_COOKIE,
} from '@/domains/identity/platform-auth/contracts/session';
import type { RuntimeServices } from '@/ports/runtime-services';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import type { SqlSchemaStrategy } from '@/infra/db/sql/database';
import type { FudabaMessageResult } from '@/ports/repositories/fudaba-messages';
import { fudabaMessageSchema } from '@imsweb/contracts/fudaba/messages';
import {
    createPostgresTestDatabase,
    connectPostgresTestDatabase,
} from '../postgres-test-database';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';

const noopSchema: SqlSchemaStrategy = {
    initializeCore: async () => {},
    initializePlatform: async () => {},
    initializeFudaba: async () => {},
    initializeStory: async () => {},
};
const now = '2026-10-13T00:00:00.000Z';
function message(result: FudabaMessageResult) {
    if (result.status !== 'ok')
        throw new Error('Unexpected message outcome: ' + result.status);
    assert.equal(result.status, 'ok');
    return fudabaMessageSchema.parse(result.message);
}
async function fixture() {
    const database = await createPostgresTestDatabase('messages_v2');
    await seedCanonicalFudabaAgencies(database);
    await database
        .prepare(
            "INSERT INTO platform_accounts(id,status,token_version,created_at,updated_at) VALUES('owner','active',0,0,0),('author','active',0,0,0),('other','active',0,0,0),('restricted','restricted',0,0,0)"
        )
        .run();
    await database
        .prepare(
            "INSERT INTO fudaba_offices(id,owner_account_id,slug,name,city,address,latitude,longitude,created_at,updated_at) VALUES('office','owner','office','Office','Shanghai','Address',31,121,?,?),('second','owner','second','Second','Shanghai','Address',31,121,?,?)"
        )
        .bind(now, now, now, now)
        .run();
    const wallReviewer = await insertBackofficeAccount(database, 'message-office-reviewer');
    await database.prepare("UPDATE fudaba_offices SET review_state='published', review_submitted_at=created_at, reviewed_at=updated_at, reviewed_by=?, review_note='', review_operation_id=NULL, review_audit_id=?")
      .bind(wallReviewer, '00000000-0000-4000-8000-000000000001').run();

    const repo = new SqlFudabaRepository(database, noopSchema);
    const hash = (value: string) =>
        createHash('sha256').update(value).digest('hex');
    const create = (
        id: string,
        overrides: Partial<Parameters<typeof repo.messages.create>[0]> = {}
    ) => {
        const input = {
            id,
            officeId: 'office',
            actorId: 'author',
            content: '你好 🌸',
            color: 'cream' as const,
            keyHash: id,
            requestHash: id,
            now,
            ...overrides,
        };
        return repo.messages.create({
            ...input,
            keyHash: hash(input.keyHash),
            requestHash: hash(input.requestHash),
        });
    };
    return { database, repo, create };
}
test(
    'V2 creates atomically, preserves color, scopes cooldown to office, and never resurrects a destroyed receipt',
    { timeout: 60_000 },
    async () => {
        const { database, repo, create } = await fixture();
        const first = message(await create('first', { color: 'lavender' }));
        assert.equal(first.color, 'lavender');
        assert.equal(first.placement.rotation, 0);
        assert.equal(
            message(await create('first', { id: 'replay', color: 'lavender' }))
                .id,
            'first'
        );
        assert.equal((await create('second-intent')).status, 'limited');
        assert.equal(
            message(await create('second-office', { officeId: 'second' }))
                .office.id,
            'second'
        );
        assert.equal(
            (
                await create('conflict', {
                    keyHash: 'first',
                    requestHash: 'different',
                })
            ).status,
            'idempotency-conflict'
        );
        assert.equal(
            (await repo.messages.destroy(first.id, 'other')).status,
            'forbidden'
        );
        assert.equal(
            (await repo.messages.destroy(first.id, 'restricted')).status,
            'forbidden'
        );
        assert.equal(
            (await repo.messages.destroy(first.id, 'author')).status,
            'ok'
        );
        assert.equal(
            (
                await create('first', {
                    id: 'cannot-recreate',
                    color: 'lavender',
                })
            ).status,
            'gone'
        );
        assert.equal(
            await database
                .prepare(
                    "SELECT count(*) AS total FROM fudaba_messages WHERE id IN ('first','cannot-recreate','second-intent')"
                )
                .first<{ total: string }>()
                .then((row) => Number(row!.total)),
            0
        );
        assert.equal(
            await database
                .prepare(
                    "SELECT count(*) AS total FROM fudaba_message_placements WHERE message_id='first'"
                )
                .first<{ total: string }>()
                .then((row) => Number(row!.total)),
            0
        );
        const receipt = await database
            .prepare(
                "SELECT * FROM fudaba_mutation_receipts WHERE scope='message-create' AND resource_id='first'"
            )
            .first<Record<string, unknown>>();
        assert.ok(receipt);
        assert.equal(JSON.stringify(receipt).includes('你好'), false);
    }
);
test(
    'V2 content, placement and moderation use independent revisions, with compare-and-swap across connections',
    { timeout: 60_000 },
    async () => {
        const { database, repo, create } = await fixture();
        const first = message(await create('cas'));
        const second = new SqlFudabaRepository(
            connectPostgresTestDatabase(database),
            noopSchema
        );
        const result = await Promise.all([
            repo.messages.edit(
                first.id,
                'author',
                { content: '正文一', color: 'rose', expectedRevision: 0 },
                now
            ),
            second.messages.edit(
                first.id,
                'author',
                { content: '正文二', color: 'blue', expectedRevision: 0 },
                now
            ),
        ]);
        assert.deepEqual(result.map((value) => value.status).sort(), [
            'conflict',
            'ok',
        ]);
        const moved = message(
            await repo.messages.place(
                first.id,
                'owner',
                {
                    ...first.placement,
                    layoutVersion: 1,
                    x: 9000,
                    y: -2000,
                    expectedRevision: 0,
                },
                now
            )
        );
        assert.equal(moved.contentRevision, 1);
        assert.equal(moved.placement.revision, 1);
        assert.equal(moved.moderationRevision, 0);
        assert.equal(
            (
                await repo.messages.place(
                    first.id,
                    'author',
                    {
                        ...first.placement,
                        layoutVersion: 1,
                        x: 1,
                        y: 1,
                        expectedRevision: 0,
                    },
                    now
                )
            ).status,
            'conflict'
        );
        const wall = await database
            .prepare(
                "SELECT right_edge,top_edge FROM fudaba_office_walls WHERE office_id='office'"
            )
            .first<{ right_edge: number; top_edge: number }>();
        assert.ok(wall!.right_edge > 9000);
        assert.ok(wall!.top_edge < -2000);
    }
);
test(
    'V2 hidden/closed/archived lifecycle preserves private destruction, rejects unrelated and restricted actors',
    { timeout: 60_000 },
    async () => {
        const { database, repo, create } = await fixture();
        const first = message(await create('hidden'));
        assert.equal(
            (
                await repo.messages.moderate(
                    first.id,
                    'other',
                    'office',
                    true,
                    0,
                    now
                )
            ).status,
            'forbidden'
        );
        const hidden = message(
            await repo.messages.moderate(
                first.id,
                'owner',
                'office',
                true,
                0,
                now
            )
        );
        assert.equal(hidden.hiddenByOffice, true);
        assert.equal(hidden.capabilities.canEdit, false);
        assert.equal(
            (await create('hidden', { id: 'replay-hidden' })).status,
            'not-editable'
        );
        assert.equal(
            (
                await repo.messages.edit(
                    first.id,
                    'author',
                    {
                        content: '不得重新公开',
                        color: 'cream',
                        expectedRevision: 0,
                    },
                    now
                )
            ).status,
            'not-editable'
        );
        assert.equal(
            (await repo.messages.readWall('office', null, {
                limit: 50,
                scope: 'hidden',
            }))!.items.length,
            0
        );
        assert.equal(
            (await repo.messages.list({
                mode: 'mine',
                actorId: 'author',
                limit: 50,
                scope: 'mine',
            }))!.messages.length,
            1
        );
        await database
            .prepare(
                "UPDATE fudaba_offices SET is_open=FALSE WHERE id='office'"
            )
            .run();
        assert.equal(
            (await create('closed', { now: '2026-10-13T00:00:20.000Z' }))
                .status,
            'closed'
        );
        await database
            .prepare(
                "UPDATE fudaba_offices SET status='archived',archived_at=? WHERE id='office'"
            )
            .bind(now)
            .run();
        assert.equal(
            await repo.messages.readWall('office', null, {
                limit: 50,
                scope: 'archived',
            }),
            null
        );
        assert.equal(
            (await repo.messages.destroy(first.id, 'restricted')).status,
            'forbidden'
        );
        assert.equal(
            (await repo.messages.destroy(first.id, 'author')).status,
            'ok'
        );
    }
);
test(
    'V2 mixed keyset pages cover 1000 mixed objects, use shared stacking, and retain old card-only semantics',
    { timeout: 60_000 },
    async () => {
        const { database, repo } = await fixture();
        await database
            .prepare(
                `INSERT INTO fudaba_cards(id,owner_account_id,producer_name,front_object_key,back_object_key,publication_status,created_at,updated_at) SELECT 'card-'||lpad(n::text,4,'0'),'owner','Producer','community/fudaba/'||n||'/front.webp','community/fudaba/'||n||'/back.webp','published',?::timestamptz,?::timestamptz FROM generate_series(1,500)n`
            )
            .bind(now, now)
            .run();
        await database.prepare(
            "INSERT INTO fudaba_card_series(card_id,series_code,display_order) SELECT id,'765',1 FROM fudaba_cards WHERE id LIKE 'card-%'"
        ).run();
        await database
            .prepare(
                `INSERT INTO fudaba_office_cards(office_id,card_id,pinned_at,world_x,world_y,z_index,updated_at) SELECT 'office','card-'||lpad(n::text,4,'0'),?::timestamptz,800,450,n,?::timestamptz FROM generate_series(1,500)n`
            )
            .bind(now, now)
            .run();
        await database
            .prepare(
                `INSERT INTO fudaba_messages(id,office_id,author_account_id,content,color,created_at,updated_at) SELECT 'note-'||lpad(n::text,4,'0'),'office','author','留言 '||n,'cream',?::timestamptz,?::timestamptz FROM generate_series(1,500)n`
            )
            .bind(now, now)
            .run();
        await database
            .prepare(
                `INSERT INTO fudaba_message_placements(message_id,office_id,pinned_at,world_x,world_y,z_index,updated_at) SELECT 'note-'||lpad(n::text,4,'0'),'office',?::timestamptz,800,450,n+500,?::timestamptz FROM generate_series(1,500)n`
            )
            .bind(now, now)
            .run();
        await database
            .prepare(
                "UPDATE fudaba_office_walls SET max_z_index=1000 WHERE office_id='office'"
            )
            .run();
        const tiny = await createFudabaTinyPreview(
            new SharpImageProcessor(),
            await sharp({
                create: {
                    width: 600,
                    height: 400,
                    channels: 3,
                    background: '#ef92ac',
                },
            })
                .webp()
                .toBuffer()
        );
        assert.ok(tiny);
        await database
            .prepare(
                "INSERT INTO fudaba_card_media_previews(object_key,asset_sha256,preview_data_url) SELECT front_object_key,repeat('a',64),? FROM fudaba_cards"
            )
            .bind(tiny)
            .run();
        const indexStarted = performance.now();
        let layoutBytes = 0;
        const layoutKeys = new Set<string>();
        const seen = new Set<string>();
        let cursor: string | undefined;
        let pages = 0;
        do {
            const page = await repo.messages.readWall('office', 'owner', {
                limit: 100,
                scope: 'all',
                cursor,
                bbox: [0, 0, 1600, 900],
            });
            assert.ok(page);
            assert.equal(page.wall.total, 1000);
            const layouts = await repo.messages.layouts(page.items);
            assert.equal(layouts.length, page.items.length);
            layoutBytes += Buffer.byteLength(JSON.stringify(layouts));
            for (const item of layouts) {
                const key = `${item.kind}:${item.id}`;
                assert.equal(layoutKeys.has(key), false);
                layoutKeys.add(key);
                if (item.kind === 'card') assert.equal(item.preview, tiny);
            }

            for (const item of page.items) {
                const key =
                    item.kind +
                    ':' +
                    (item.kind === 'card' ? item.card.id : item.message.id);
                assert.equal(seen.has(key), false);
                seen.add(key);
            }
            cursor = page.pageInfo.nextCursor ?? undefined;
            pages++;
            assert.ok(pages <= 10);
        } while (cursor);
        assert.equal(seen.size, 1000);
        assert.equal(pages, 10);
        assert.equal(layoutKeys.size, 1000);
        await database
            .prepare(
                "UPDATE fudaba_cards SET front_object_key=front_object_key WHERE id='card-0001'"
            )
            .run();
        const invalidated = await database
            .prepare(
                "SELECT object_key FROM fudaba_card_media_previews WHERE object_key='community/fudaba/1/front.webp'"
            )
            .all();
        assert.equal(invalidated.results.length, 0);

        console.info(
            'scene-index-sample',
            JSON.stringify({
                objects: 1000,
                cards: 500,
                messages: 500,
                bytes: layoutBytes,
                durationMs: Math.round(performance.now() - indexStarted),
            })
        );

        const old = await repo.findPublicWall('office', null, {
            limit: 100,
            scope: 'old',
        });
        assert.equal(old!.wall.total, 500);
        assert.ok(
            old!.office.cards.every((card) => card.id.startsWith('card-'))
        );
        await assert.rejects(
            repo.messages.readWall('office', null, {
                limit: 100,
                scope: 'wrong',
                cursor: Buffer.from(
                    JSON.stringify({
                        scope: 'all',
                        pinned: now,
                        id: 'card-0001',
                        kind: 'card',
                    })
                ).toString('base64url'),
            }),
            /游标/
        );
    }
);

test(
    'V2 HTTP contracts keep public messages private, protect writes and enforce cookie CSRF',
    { timeout: 60_000 },
    async () => {
        const { database, repo, create } = await fixture();
        const original = message(await create('http-public'));

        const token = 'v2-platform-fixture-token',
            csrf = 'v2-platform-fixture-csrf';
        const runtime = (actorId: string, enabled = true): RuntimeServices => {
            const current = Date.now();
            return {
                fudaba: repo,
                config: {
                    fudabaPublicReadEnabled: true,
                    fudabaWriteEnabled: true,
                    fudabaMessageCreateEnabled: enabled,
                },
                rateLimiter: {
                    consume: async () => ({
                        allowed: true,
                        remaining: 99,
                        resetAt: current + 60_000,
                    }),
                },
                platformTokens: {
                    sign: async () => token,
                    verify: async (value: string) => {
                        if (value !== token)
                            throw new Error('invalid fixture token');
                        return {
                            iss: 'imsweb' as const,
                            aud: 'ims-platform' as const,
                            kind: 'platform' as const,
                            id: actorId,
                            tokenVersion: 0,
                            sessionId: 'v2-session',
                            csrfSecret: csrf,
                            jti: 'v2-access',
                            iat: Math.floor(current / 1000),
                            exp: Math.floor(current / 1000) + 900,
                        };
                    },
                },
                platformAccounts: {
                    findRefreshSessionById: async (id: string) =>
                        id === 'v2-session'
                            ? {
                                  id,
                                  account_id: actorId,
                                  token_hash: 'hash',
                                  previous_token_hash: null,
                                  csrf_hash: fixtureSha256Hex(csrf),
                                  expires_at: current + 60_000,
                                  created_at: current,
                                  updated_at: current,
                                  revoked_at: null,
                              }
                            : null,
                    findAccountWithProfileById: async (id: string) => {
                        if (id !== actorId) return null;
                        const account = await database
                            .prepare(
                                'SELECT status FROM platform_accounts WHERE id=?'
                            )
                            .bind(id)
                            .first<{ status: 'active' | 'restricted' }>();
                        if (!account) return null;
                        return {
                            account: {
                                id,
                                status: account.status,
                                token_version: 0,
                                created_at: current,
                                updated_at: current,
                                deleted_at: null,
                            },
                            profile: {
                                account_id: id,
                                display_name: 'Fixture Author',
                                avatar_object_key: null,
                                avatar_external_url: null,
                                home_city: null,
                                bio: '',
                                updated_at: current,
                            },
                        };
                    },
                    revokeRefreshSession: async () => true,
                } as unknown as NonNullable<
                    RuntimeServices['platformAccounts']
                >,
            };
        };
        const app = createHonoApp(() => runtime('author'));
        const publicResponse = await app.request(
            'http://ims.test/api/community/exchange/offices/office/mixed-wall'
        );
        assert.equal(publicResponse.status, 200);
        assert.match(
            publicResponse.headers.get('cache-control') ?? '',
            /no-store/
        );
        const publicBody = await readContractJson(
            publicResponse,
            fudabaMixedWallResponseSchema
        );
        const publicNote = publicBody.items.find(
            (item) => item.kind === 'message'
        );
        assert.ok(publicNote && publicNote.kind === 'message');
        assert.equal('authorAccountId' in publicNote.message, false);
        assert.equal('moderationRevision' in publicNote.message, false);
        assert.equal('hiddenByOffice' in publicNote.message, false);
        assert.equal('status' in publicNote.message.office, false);
        assert.equal(
            (
                await app.request(
                    'http://ims.test/api/community/exchange/messages/' +
                        original.id
                )
            ).status,
            401
        );
        const headers = bearerTokenHeaders(token, {
            'content-type': 'application/json',
            'Idempotency-Key': 'http-create',
        });
        const disabled = createHonoApp(() => runtime('author', false));
        const denied = await disabled.request(
            'http://ims.test/api/community/exchange/offices/office/messages',
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ content: '创建关闭', color: 'cream' }),
            }
        );
        assert.equal(denied.status, 503);
        assert.equal(
            (
                (await readContractJson(
                    denied,
                    fudabaMessageErrorResponseSchema
                )) as {
                    code: string;
                }
            ).code,
            'FUDABA_MESSAGE_CREATE_DISABLED'
        );
        const body = {
            content: '  <b>😀</b>\n纯文字  ',
            color: 'blue',
            center: { x: 8000, y: -3000 },
        };
        const created = await app.request(
            'http://ims.test/api/community/exchange/offices/office/messages',
            { method: 'POST', headers, body: JSON.stringify(body) }
        );
        assert.equal(created.status, 201);
        const createdBody = await readContractJson(
            created,
            fudabaMessageResponseSchema
        );
        assert.equal(createdBody.message.content, body.content.trim());
        assert.equal(createdBody.message.color, 'blue');
        assert.ok(Math.abs(createdBody.message.placement.x - 8000) < 1000);
        assert.ok(Math.abs(createdBody.message.placement.y + 3000) < 1000);
        const replay = await app.request(
            'http://ims.test/api/community/exchange/offices/office/messages',
            { method: 'POST', headers, body: JSON.stringify(body) }
        );
        assert.equal(replay.status, 201);
        assert.equal(
            (await readContractJson(replay, fudabaMessageResponseSchema))
                .message.id,
            createdBody.message.id
        );
        const conflict = await app.request(
            'http://ims.test/api/community/exchange/offices/office/messages',
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ ...body, color: 'rose' }),
            }
        );
        assert.equal(conflict.status, 409);
        await readContractJson(conflict, fudabaMessageErrorResponseSchema);
        const other = createHonoApp(() => runtime('other'));
        const invalid = await other.request(
            'http://ims.test/api/community/exchange/offices/office/messages',
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    content: '😀'.repeat(281),
                    color: 'cream',
                }),
            }
        );
        assert.equal(invalid.status, 400);
        await readContractJson(invalid, fudabaMessageErrorResponseSchema);
        const missingCsrf = cookieCsrfHeaders(
            [
                [PLATFORM_ACCESS_TOKEN_COOKIE, token],
                [PLATFORM_CSRF_TOKEN_COOKIE, csrf],
            ],
            null,
            {
                'content-type': 'application/json',
                'Idempotency-Key': 'cookie-create',
            }
        );
        assert.equal(
            (
                await other.request(
                    'http://ims.test/api/community/exchange/offices/second/messages',
                    {
                        method: 'POST',
                        headers: missingCsrf,
                        body: JSON.stringify({
                            content: 'cookie',
                            color: 'cream',
                        }),
                    }
                )
            ).status,
            403
        );
        const validCsrf = { ...missingCsrf, 'x-csrftoken': csrf };
        assert.equal(
            (
                await other.request(
                    'http://ims.test/api/community/exchange/offices/second/messages',
                    {
                        method: 'POST',
                        headers: validCsrf,
                        body: JSON.stringify({
                            content: '😀'.repeat(280),
                            color: 'cream',
                        }),
                    }
                )
            ).status,
            201
        );
        const privateDenied = await other.request(
            'http://ims.test/api/community/exchange/messages/' + original.id,
            { headers: bearerTokenHeaders(token) }
        );
        assert.equal(privateDenied.status, 403);
        await readContractJson(privateDenied, fudabaMessageErrorResponseSchema);
        const malformed = await app.request(
            'http://ims.test/api/community/exchange/offices/office/mixed-wall?cursor=bnVsbA'
        );
        assert.equal(malformed.status, 400);
        await readContractJson(malformed, fudabaMessageErrorResponseSchema);
    }
);

test(
    'V2 super-admin authority is checked against current database role and hiding layers remain independent',
    { timeout: 60_000 },
    async () => {
        const { database, repo, create } = await fixture();
        const note = message(await create('moderated'));
        await database
            .prepare(
                "INSERT INTO backoffice_accounts(id,username,password,dept,producername,admin_role) VALUES(7,'v2-super','fixture-hash','op','Super','super_admin'),(8,'v2-admin','fixture-hash','op','Admin','admin')"
            )
            .run();
        const ownerHidden = message(
            await repo.messages.moderate(
                note.id,
                'owner',
                'office',
                true,
                0,
                now
            )
        );
        assert.equal(ownerHidden.moderationRevision, 1);
        assert.equal(
            (await repo.messages.moderate(note.id, '8', 'admin', true, 1, now))
                .status,
            'forbidden'
        );
        const adminHidden = message(
            await repo.messages.moderate(note.id, '7', 'admin', true, 1, now)
        );
        assert.equal(adminHidden.hiddenByAdmin, true);
        const ownerRestored = message(
            await repo.messages.moderate(
                note.id,
                'owner',
                'office',
                false,
                2,
                now
            )
        );
        assert.equal(ownerRestored.hiddenByOffice, false);
        assert.equal(ownerRestored.hiddenByAdmin, true);
        assert.equal(
            (await repo.messages.readWall('office', null, {
                limit: 50,
                scope: 'layers',
            }))!.items.length,
            0
        );
        assert.equal(
            (await repo.messages.moderate(note.id, '7', 'admin', false, 0, now))
                .status,
            'conflict'
        );

        const token = 'v2-backoffice-fixture';
        const appFor = (id: number) =>
            createHonoApp(() => ({
                fudaba: repo,
                backofficeTokens: {
                    sign: async () => token,
                    verify: async (value: string) => {
                        if (value !== token)
                            throw new Error('invalid fixture token');
                        return {
                            iss: 'imsweb' as const,
                            aud: 'ims-backoffice' as const,
                            kind: 'backoffice' as const,
                            id,
                            username: 'v2-reviewer',
                            producername: 'Reviewer',
                            dept: 'op',
                            adminRole: 'super_admin' as const,
                            csrfSecret: 'fixture-csrf',
                        };
                    },
                },
                backofficeAuth: {
                    findUserById: async (userId: number) =>
                        database
                            .prepare(
                                'SELECT id::INTEGER AS id,username,password,dept,producername,admin_role FROM backoffice_accounts WHERE id=?'
                            )
                            .bind(userId)
                            .first(),
                } as NonNullable<RuntimeServices['backofficeAuth']>,
            }));
        const ordinary = await appFor(8).request(
            'http://ims.test/api/admin/community/exchange/messages',
            { headers: bearerTokenHeaders(token) }
        );
        assert.equal(ordinary.status, 403);
        await readContractJson(ordinary, fudabaMessageErrorResponseSchema);
        const privileged = appFor(7);
        const listing = await privileged.request(
            'http://ims.test/api/admin/community/exchange/messages?status=admin-hidden',
            { headers: bearerTokenHeaders(token) }
        );
        assert.equal(listing.status, 200);
        assert.equal(
            (await readContractJson(listing, fudabaMessageListResponseSchema))
                .messages.length,
            1
        );
        const restored = await privileged.request(
            'http://ims.test/api/admin/community/exchange/messages/' +
                note.id +
                '/moderation',
            {
                method: 'PUT',
                headers: bearerTokenHeaders(token, {
                    'content-type': 'application/json',
                }),
                body: JSON.stringify({ hidden: false, expectedRevision: 3 }),
            }
        );
        assert.equal(restored.status, 200);
        assert.equal(
            (await readContractJson(restored, fudabaMessageResponseSchema))
                .message.hiddenByAdmin,
            false
        );
        assert.equal(
            (await repo.messages.readWall('office', null, {
                limit: 50,
                scope: 'restored',
            }))!.items.length,
            1
        );
    }
);

test(
    'V2 holder arranges an existing visitor card without permission to publish that card',
    { timeout: 60_000 },
    async () => {
        const { database, repo } = await fixture();
        await database
            .prepare(
                "INSERT INTO fudaba_cards(id,owner_account_id,producer_name,front_object_key,back_object_key,publication_status,created_at,updated_at) VALUES('visitor-card','author','Author','community/fudaba/visitor/front.webp','community/fudaba/visitor/back.webp','published',?,?)"
            )
            .bind(now, now)
            .run();
        await database.prepare(
            "INSERT INTO fudaba_card_series(card_id,series_code,display_order) VALUES('visitor-card','765',1)"
        ).run();
        const input = {
            officeId: 'office',
            cardId: 'visitor-card',
            ownerAccountId: 'owner',
            positionX: 800,
            positionY: 450,
            rotation: 0,
            zIndex: 1,
            expectedRevision: null,
            updatedAt: now,
        };
        assert.equal(
            (await repo.saveCardPlacementForOwner(input)).status,
            'unavailable'
        );
        assert.equal(
            (
                await repo.saveCardPlacementForOwner({
                    ...input,
                    ownerAccountId: 'author',
                })
            ).status,
            'saved'
        );
        assert.equal(
            (
                await repo.saveCardPlacementForOwner({
                    ...input,
                    ownerAccountId: 'other',
                    expectedRevision: 0,
                })
            ).status,
            'unavailable'
        );
        const moved = await repo.saveCardPlacementForOwner({
            ...input,
            positionX: 3000,
            expectedRevision: 0,
        });
        assert.equal(moved.status, 'saved');
        assert.equal(
            (
                await repo.saveCardPlacementForOwner({
                    ...input,
                    expectedRevision: 0,
                })
            ).status,
            'conflict'
        );
        assert.equal(
            (
                await repo.removeCardPlacementForOwner({
                    officeId: 'office',
                    cardId: 'visitor-card',
                    ownerAccountId: 'other',
                    expectedRevision: 1,
                })
            ).status,
            'unavailable'
        );
        assert.equal(
            (
                await repo.removeCardPlacementForOwner({
                    officeId: 'office',
                    cardId: 'visitor-card',
                    ownerAccountId: 'owner',
                    expectedRevision: 1,
                })
            ).status,
            'removed'
        );
    }
);

test(
    'legacy message writes also get atomic V2 placement',
    { timeout: 60_000 },
    async () => {
        const { repo } = await fixture();
        const input = {
            id: 'legacy-note',
            officeId: 'office',
            authorAccountId: 'author',
            content: '旧入口留言',
            createdAt: now,
        };
        assert.equal(await repo.createMessage(input), true);
        assert.equal(await repo.createMessage(input), false);
        const read = message(await repo.messages.read(input.id, 'author'));
        assert.equal(read.color, 'cream');
        assert.equal(read.content, input.content);
        assert.equal(
            (await repo.messages.readWall('office', null, {
                limit: 50,
                scope: 'legacy',
            }))!.items.length,
            1
        );
    }
);

test(
    'all five message colors persist and a failed receipt rolls back content, placement and cooldown',
    { timeout: 60_000 },
    async () => {
        const { database, repo, create } = await fixture();
        let current = message(await create('palette'));
        for (const color of [
            'cream',
            'rose',
            'mint',
            'blue',
            'lavender',
        ] as const) {
            current = message(
                await repo.messages.edit(
                    current.id,
                    'author',
                    {
                        content: current.content,
                        color,
                        expectedRevision: current.contentRevision,
                    },
                    now
                )
            );
            assert.equal(current.color, color);
            assert.equal(
                message(await repo.messages.read(current.id, 'author')).color,
                color
            );
        }
        const before = await database
            .prepare('SELECT count(*)::int AS count FROM fudaba_messages')
            .first<{ count: number }>();
        const wallBefore = await database
            .prepare(
                "SELECT row_to_json(wall)::text AS state FROM fudaba_office_walls wall WHERE office_id='second'"
            )
            .first<{ state: string }>();
        const receiptsBefore = await database
            .prepare(
                'SELECT count(*)::int AS count FROM fudaba_mutation_receipts'
            )
            .first<{ count: number }>();
        await database.executeScript(
            `CREATE FUNCTION reject_message_receipt() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'injected receipt failure'; END; $fn$; CREATE TRIGGER reject_message_receipt BEFORE INSERT ON fudaba_mutation_receipts FOR EACH ROW EXECUTE FUNCTION reject_message_receipt();`
        );
        await assert.rejects(
            () => create('rollback', { officeId: 'second' }),
            /injected receipt failure/
        );
        assert.equal(
            (await database
                .prepare('SELECT count(*)::int AS count FROM fudaba_messages')
                .first<{ count: number }>())!.count,
            before!.count
        );
        assert.equal(
            await database
                .prepare(
                    "SELECT message_id FROM fudaba_message_placements WHERE message_id='rollback'"
                )
                .first(),
            null
        );
        assert.equal(
            await database
                .prepare(
                    "SELECT account_id FROM fudaba_message_publish_cooldowns WHERE office_id='second'"
                )
                .first(),
            null
        );
        assert.equal(
            await database
                .prepare("SELECT id FROM fudaba_messages WHERE id='rollback'")
                .first(),
            null
        );
        assert.deepEqual(
            await database
                .prepare(
                    "SELECT row_to_json(wall)::text AS state FROM fudaba_office_walls wall WHERE office_id='second'"
                )
                .first(),
            wallBefore
        );
        assert.equal(
            (await database
                .prepare(
                    'SELECT count(*)::int AS count FROM fudaba_mutation_receipts'
                )
                .first<{ count: number }>())!.count,
            receiptsBefore!.count
        );
        await database.executeScript(
            'DROP TRIGGER reject_message_receipt ON fudaba_mutation_receipts; DROP FUNCTION reject_message_receipt();'
        );
        assert.equal(
            message(await create('rollback', { officeId: 'second' })).id,
            'rollback'
        );
    }
);

test('scene layout uses measured heights in rotated queries and preserves legacy exact responses', async () => {
    const sceneNow = '2026-10-13T00:01:00.000Z';
    const { database, repo, create } = await fixture();
    const short = message(await create('scene-short', { height: 160 }));
    const long = message(
        await create('scene-long', {
            height: 560,
            now: '2026-10-13T00:00:20.000Z',
        })
    );
    const placed = message(
        await repo.messages.place(
            long.id,
            'author',
            {
                layoutVersion: 1,
                x: 1500,
                y: 1500,
                rotation: 12,
                zIndex: long.placement.zIndex,
                expectedRevision: 0,
            },
            '2026-10-13T00:00:30.000Z'
        )
    );
    const intersecting = await repo.messages.readWall('office', null, {
        limit: 100,
        scope: 'scene-long',
        bbox: [1490, 1200, 1510, 1220],
    });
    assert.ok(
        intersecting?.items.some(
            (item) => item.kind === 'message' && item.message.id === long.id
        )
    );
    const layouts = await repo.messages.layouts(intersecting!.items);
    assert.equal(layouts[0].height, 560);
    const app = createHonoApp(() => ({
        fudaba: repo,
        config: {
            fudabaPublicReadEnabled: true,
            fudabaWriteEnabled: true,
            fudabaMessageCreateEnabled: true,
        },
    }));
    const index = await readContractJson(
        await app.request(
            'http://ims.test/api/community/exchange/offices/office/wall-layout'
        ),
        fudabaWallLayoutResponseSchema
    );
    assert.equal(index.version, 1);
    assert.equal(index.items.find((item) => item.id === short.id)?.height, 160);
    assert.equal(JSON.stringify(index).includes('你好'), false);
    const scene = await readContractJson(
        await app.request(
            'http://ims.test/api/community/exchange/offices/office/wall-scene'
        ),
        fudabaWallSceneResponseSchema
    );
    assert.equal(
        scene.layouts.find((item) => item.id === long.id)?.height,
        560
    );
    const legacy = await readContractJson(
        await app.request(
            'http://ims.test/api/community/exchange/offices/office/mixed-wall'
        ),
        fudabaMixedWallResponseSchema
    );
    assert.equal('layouts' in legacy, false);
    const edited = message(
        await repo.messages.edit(
            long.id,
            'author',
            {
                content: '短了',
                color: 'blue',
                height: 160,
                expectedRevision: 0,
            },
            '2026-10-13T00:00:40.000Z'
        )
    );
    assert.deepEqual(edited.placement, placed.placement);
    const outside = await repo.messages.readWall('office', null, {
        limit: 100,
        scope: 'scene-shortened',
        bbox: [1490, 1200, 1510, 1220],
    });
    assert.equal(
        outside?.items.some(
            (item) => item.kind === 'message' && item.message.id === long.id
        ),
        false
    );
    await repo.messages.edit(
        long.id,
        'author',
        { content: '旧客户端', color: 'cream', expectedRevision: 1 },
        '2026-10-13T00:00:50.000Z'
    );
    const row = await database
        .prepare('SELECT display_height FROM fudaba_messages WHERE id=?')
        .bind(long.id)
        .first<{ display_height: number }>();
    assert.equal(Number(row?.display_height), 160);
    assert.equal(
        await repo.messages.applyLayoutBackfill(short.id, 0, 200),
        'ok'
    );
    const unchanged = message(await repo.messages.read(short.id, 'author'));
    assert.deepEqual(unchanged.placement, short.placement);
    assert.equal(
        await repo.messages.applyLayoutBackfill(short.id, 99, 300),
        'conflict'
    );
    await repo.messages.moderate(long.id, 'owner', 'office', true, 0, sceneNow);
    const hiddenIndex = await readContractJson(
        await app.request(
            'http://ims.test/api/community/exchange/offices/office/wall-layout'
        ),
        fudabaWallLayoutResponseSchema
    );
    assert.equal(
        hiddenIndex.items.some((item) => item.id === long.id),
        false
    );
});

test('late previews cannot restore stale media after a concurrent replacement', async () => {
    const { database, repo } = await fixture();
    const objectKey = 'community/fudaba/race/front.webp';
    await database
        .prepare(
            `INSERT INTO fudaba_cards
        (id, owner_account_id, producer_name, front_object_key, back_object_key, publication_status, created_at, updated_at)
        VALUES ('race-card', 'owner', 'Producer', ?, 'community/fudaba/race/back.webp', 'published', ?, ?)`
        )
        .bind(objectKey, now, now)
        .run();
    await database.prepare(
        "INSERT INTO fudaba_card_series(card_id,series_code,display_order) VALUES('race-card','765',1)"
    ).run();
    const preview = 'data:image/webp;base64,UklGRg==';
    const guard = { cardId: 'race-card', revision: 0, side: 'front' as const };
    assert.equal(
        await repo.messages.saveMediaPreview(objectKey, 'old', preview, guard),
        true
    );
    let locked!: () => void;
    let release!: () => void;
    const isLocked = new Promise<void>((resolve) => {
        locked = resolve;
    });
    const mayCommit = new Promise<void>((resolve) => {
        release = resolve;
    });
    const replacement = database.transaction(async (transaction) => {
        await transaction
            .prepare(
                `UPDATE fudaba_cards SET revision = revision + 1,
            front_object_key = front_object_key WHERE id = 'race-card'`
            )
            .run();
        locked();
        await mayCommit;
    });
    await isLocked;
    const staleWrite = repo.messages.saveMediaPreview(
        objectKey,
        'old',
        preview,
        guard
    );
    release();
    await replacement;
    assert.equal(await staleWrite, false);
    assert.equal(
        await repo.messages.saveMediaPreview(objectKey, 'old', null, guard),
        false
    );
    const absent = await database
        .prepare(
            'SELECT object_key FROM fudaba_card_media_previews WHERE object_key = ?'
        )
        .bind(objectKey)
        .all();
    assert.equal(absent.results.length, 0);
    assert.equal(
        await repo.messages.saveMediaPreview(objectKey, 'new', preview, {
            ...guard,
            revision: 1,
        }),
        true
    );
    // A stale failed generation must not delete a newer valid preview either.
    assert.equal(
        await repo.messages.saveMediaPreview(objectKey, 'old', null, guard),
        false
    );
    const current = await database
        .prepare(
            'SELECT asset_sha256 FROM fudaba_card_media_previews WHERE object_key = ?'
        )
        .bind(objectKey)
        .first<{ asset_sha256: string }>();
    assert.equal(current?.asset_sha256, 'new');
});
