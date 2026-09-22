// Merged from 19 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { readContractJson as contractJson } from '../contracts/contract-json';
import { bearerTokenHeaders, cookieCsrfHeaders, fixtureSha256Hex, fixtureSha256Hex as hash } from '../fixtures/auth-request';
import { CANONICAL_FUDABA_AGENCIES, projectCanonicalFudabaAgencies } from '../fixtures/fudaba-agency-catalog';
import { ACCOUNT_ID, BACKOFFICE_TOKEN, bearerHeaders, cardFields, cardUpload, cookieHeaders, CSRF_SECRET, csrfHash, JPEG_BYTES, mediaUpload, metadataBody, ownerCard, OwnerRouteFixture, postCard, profileBody, uploadedFile } from '../fixtures/owner-route-fixture';
import { insertBackofficeAccount, insertFudabaOfficePublicLocation, insertPlatformAccount } from '../fixtures/rows';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { createMigrationCatalogBefore } from '../integration/migration-catalog';
import { createPostgresTestHarness, type PostgresTestHarness } from '../integration/postgres-harness';
import { connectPostgresTestDatabase, createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';
import { createHonoApp } from '@/app';
import type { AppEnvironment } from '@/app';
import { BACKOFFICE_ACCESS_TOKEN_COOKIE, BACKOFFICE_CSRF_TOKEN_COOKIE } from '@/domains/admin/backoffice-auth/backoffice-auth-session';
import { parseFudabaCardCreateFields } from '@/domains/community/fudaba/cards/request';
import { parseLegacyCardClaim } from '@/domains/community/fudaba/claims/request';
import { fudabaCardClaimView } from '@/domains/community/fudaba/contracts/claim';
import { handleReviewFudabaCardClaim, handleReviewFudabaRegisteredCard } from '@/domains/community/fudaba/moderation/handlers/admin-card-reviews';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { PLATFORM_ACCESS_TOKEN_COOKIE, PLATFORM_CSRF_TOKEN_COOKIE } from '@/domains/identity/platform-auth/contracts/session';
import type { PostgresConnection } from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlAdminAccountRepository } from '@/infra/db/repositories/admin-account-repository';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import type { ManagedSqlDatabase, SqlDatabase, SqlResult, SqlSchemaStrategy, SqlStatement } from '@/infra/db/sql/database';
import type { CacheStore, RateLimiter } from '@/ports/cache';
import type { ParsedUpload, UploadedFile, UploadParser } from '@/ports/http';
import type { ImageInfo, ImageProcessor } from '@/ports/media';
import type { ListedObject, ObjectStorage, PutObjectOptions, StoredObject } from '@/ports/object-storage';
import type { AuditLogInput, BackofficeAccountRecord, CreateOwnedFudabaCardInput, CreateOwnedFudabaOfficeInput, FudabaAdminCardClaimRecord, FudabaCardClaimRecord, FudabaCardInteractionStateRecord, FudabaCardPlacementRecord, FudabaCardReactionInput, FudabaCardReactionRecord, FudabaOfficeCreateResult, FudabaOfficeLocationReviewRecord, FudabaOfficeMutationResult, FudabaOfficePublicLocationRecord, FudabaOfficeRecord, FudabaOwnerOfficeRecord, FudabaPublicCardRecord, FudabaPublicMapOfficeRecord, FudabaPublicOfficeDetailRecord, FudabaPublicOfficeRecord, FudabaRegisteredCardReviewRecord, FudabaRepository, ListFudabaPublicCardsInput, ListFudabaPublicMapOfficesInput, ListFudabaPublicOfficesInput, NewFudabaCardInput, NewFudabaOfficeInput, NewPlatformAccountInput, PlatformAccountStatus, PlatformAccountWithProfile, PlatformRefreshSessionRecord, UpdateOwnedFudabaOfficeInput } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { FUDABA_MAP_DELIVERY_OBJECT_KEY, namecardOriginalUrlFromObjectKey } from '@/utils/storage/business-object-keys';
import { fudabaCardDeleteResponseSchema, fudabaCardInteractionResponseSchema, fudabaCardMutationResponseSchema, fudabaCardPageSchema, fudabaCardPlacementDeleteResponseSchema, fudabaCardPlacementSaveResponseSchema, fudabaCardReactionErrorSchema, fudabaCardReactionsResponseSchema, fudabaErrorResponseSchema, fudabaMapConfigSchema, fudabaMapOfficeListSchema, fudabaOfficeDetailSchema, fudabaOfficeMutationResponseSchema, fudabaOfficePageSchema, fudabaOwnerCardDetailSchema, fudabaOwnerCardListSchema, fudabaOwnerLocationDetailSchema, fudabaOwnerLocationMutationResponseSchema, fudabaOwnerLocationWithdrawalResponseSchema, fudabaOwnerOfficeListSchema, fudabaPlaceSearchResponseSchema, fudabaSeriesListSchema } from '@imsweb/contracts/fudaba';
import { fudabaCardClaimErrorSchema, ownerClaimListSchema, reviewMutationSchema } from '@imsweb/contracts/fudaba/card-claims';
import { fudabaLocationReviewErrorSchema, fudabaLocationReviewListSchema, fudabaLocationReviewMutationSchema } from '@imsweb/contracts/fudaba/location-review';
import { fudabaMapDeliveryErrorSchema, fudabaMapDeliveryMutationSchema, fudabaMapDeliverySnapshotSchema } from '@imsweb/contracts/fudaba/map-delivery';
import { Hono } from 'hono';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, onTestFinished, test } from 'vitest';

// fudaba-agency-catalog.test.ts
{
    test.describe('canonical Fudaba agency data', () => {
        test('keeps IDs, ordering, names, colors, and icons', () => {
            assert.deepEqual(CANONICAL_FUDABA_AGENCIES, [
                { id: 1, code: '765', name: '765PRO', color: '#f34f6d', order: 0,
                    iconObjectKey: 'wiki/shared/static/icon/765pro.webp' },
                { id: 2, code: '876', name: '876PRO', color: '#656a75', order: 1,
                    iconObjectKey: 'wiki/shared/static/icon/876pro.webp' },
                { id: 3, code: 'cg', name: '灰姑娘女孩', color: '#2681c8', order: 2,
                    iconObjectKey: 'wiki/shared/static/icon/cg.webp' },
                { id: 4, code: 'ml', name: '百万现场', color: '#ffc30b', order: 3,
                    iconObjectKey: 'wiki/shared/static/icon/ml.webp' },
                { id: 5, code: 'sidem', name: 'SideM', color: '#0fbe94', order: 4,
                    iconObjectKey: 'wiki/shared/static/icon/sidem.webp' },
                { id: 6, code: 'sc', name: '闪耀色彩', color: '#8dbbff', order: 5,
                    iconObjectKey: 'wiki/shared/static/icon/sc.webp' },
                { id: 7, code: 'gk', name: '学园偶像大师', color: '#f39800', order: 6,
                    iconObjectKey: 'wiki/shared/static/icon/gk.webp' }
            ]);
        });

        test('is frozen and projections are fresh', () => {
            assert.equal(Object.isFrozen(CANONICAL_FUDABA_AGENCIES), true);
            assert.equal(CANONICAL_FUDABA_AGENCIES.every(Object.isFrozen), true);

            const first = projectCanonicalFudabaAgencies();
            const second = projectCanonicalFudabaAgencies();
            assert.notEqual(first, second);
            assert.notEqual(first[0], second[0]);
            first[0]!.name = 'mutated projection';
            assert.equal(second[0]!.name, '765PRO');
            assert.equal(CANONICAL_FUDABA_AGENCIES[0]!.name, '765PRO');
        });
    });
}

// fudaba-agency-migration.test.ts
{
    const require = createRequire(__filename);
    const { migratePostgres } = require(
        '../../scripts/migration/postgres-migrations.js'
    ) as {
        migratePostgres(options: {
            connectionString: string;
            migrationsPath?: string;
        }): Promise<unknown>;
    };

    const AGENCY_CATALOG_MIGRATION = '0027_fudaba_agency_catalog.sql';

    async function createLegacyHarness(): Promise<PostgresTestHarness> {
        const harness = await createPostgresTestHarness({
            migrationsPath: await createMigrationCatalogBefore(onTestFinished, AGENCY_CATALOG_MIGRATION),
            seedCanonicalAgencies: false
        });
        onTestFinished(() => harness.close());
        await seedCanonicalFudabaAgencies(harness.connection);
        await harness.connection.prepare(
            `INSERT INTO platform_accounts
            (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES ('agency-migration-owner', 'active', 0, 1700000000000,
                 1700000000000, NULL)`
        ).run();
        await harness.connection.prepare(
            `INSERT INTO fudaba_offices
            (id, owner_account_id, slug, name, intro, city, address,
             latitude, longitude, accent, cover_object_key, is_open,
             visitor_count, status, revision, created_at, updated_at,
             archived_at)
         VALUES
            ('agency-migration-office', 'agency-migration-owner',
             'agency-migration-office', 'Migration Office', '', 'Shanghai',
             'Migration Street', 31.23, 121.47, '#ef5b6c', NULL, TRUE,
             0, 'active', 0, '2026-08-03T00:00:00.000Z',
             '2026-08-03T00:00:00.000Z', NULL)`
        ).run();
        return harness;
    }

    describe('PostgreSQL 0027', () => {
        postgresTest('maps associated Fudaba series to canonical agencies', async () => {
            const harness = await createLegacyHarness();
            const mappings = [
                ['765as', '765'],
                ['cinderella', 'cg'],
                ['million-live', 'ml'],
                ['sidem', 'sidem'],
                ['shiny-colors', 'sc'],
                ['gakuen', 'gk']
            ] as const;
            for (const [index, [legacyCode]] of mappings.entries()) {
                await harness.connection.prepare(
                    `INSERT INTO fudaba_office_series_tags
                (office_id, series_code, display_order)
             VALUES ('agency-migration-office', ?, ?)`
                ).bind(legacyCode, index).run();
                await harness.connection.prepare(
                    `INSERT INTO fudaba_cards
                (id, owner_account_id, producer_name, display_name,
                 series_code, favorite_idol, front_object_key,
                 back_object_key, accent, bio, trade_note, available,
                 source_url, source_label, source_credit, media_rights_status,
                 publication_status, revision, created_at, updated_at,
                 deleted_at)
             VALUES (?, 'agency-migration-owner', 'Producer', ?, ?, '', ?, ?,
                     '#4f64dd', '', '', TRUE, NULL, NULL, NULL, 'approved',
                     'published', 0, '2026-08-03T00:00:00.000Z',
                     '2026-08-03T00:00:00.000Z', NULL)`
                ).bind(
                    `agency-card-${index}`,
                    `Agency Card ${index}`,
                    legacyCode,
                    `cards/agency-card-${index}/front.webp`,
                    `cards/agency-card-${index}/back.webp`
                ).run();
            }

            await migratePostgres({ connectionString: harness.databaseUrl });

            const expectedCodes = mappings.map(([, code]) => code).sort();
            const officeCodes = await harness.connection.prepare(
                `SELECT series_code
         FROM fudaba_office_series_tags
         WHERE office_id='agency-migration-office'
         ORDER BY series_code`
            ).all<{ series_code: string }>();
            const cardCodes = await harness.connection.prepare(
                `SELECT series_code
         FROM fudaba_cards
         WHERE owner_account_id='agency-migration-owner'
         ORDER BY series_code`
            ).all<{ series_code: string }>();
            assert.deepEqual(
                officeCodes.results.map(({ series_code }) => series_code),
                expectedCodes
            );
            assert.deepEqual(
                cardCodes.results.map(({ series_code }) => series_code),
                expectedCodes
            );
            assert.equal(await harness.connection.prepare(
                `SELECT to_regclass('public.fudaba_series_tags') AS table_name`
            ).first<string>('table_name'), null);

            const foreignKeys = await harness.connection.prepare(
                `SELECT source.relname AS source_table,
                target.relname AS target_table
         FROM pg_constraint constraint_record
         JOIN pg_class source ON source.oid=constraint_record.conrelid
         JOIN pg_class target ON target.oid=constraint_record.confrelid
         WHERE constraint_record.contype='f'
           AND constraint_record.conname IN (
               'fudaba_office_series_tags_series_code_fkey',
               'fudaba_cards_series_code_fkey'
           )
         ORDER BY source.relname`
            ).all<{ source_table: string; target_table: string }>();
            assert.deepEqual(foreignKeys.results, [
                { source_table: 'fudaba_cards', target_table: 'agencies' },
                {
                    source_table: 'fudaba_office_series_tags',
                    target_table: 'agencies'
                }
            ]);
        });

        postgresTest('blocks associated valiv instead of mapping it to 876', async () => {
            const harness = await createLegacyHarness();
            await harness.connection.prepare(
                `INSERT INTO fudaba_office_series_tags
            (office_id, series_code, display_order)
         VALUES ('agency-migration-office', 'valiv', 0)`
            ).run();

            await assert.rejects(
                migratePostgres({ connectionString: harness.databaseUrl }),
                /FUDABA_VALIV_AGENCY_RECONCILIATION_REQUIRED/
            );
            assert.equal(await harness.connection.prepare(
                `SELECT series_code
         FROM fudaba_office_series_tags
         WHERE office_id='agency-migration-office'`
            ).first<string>('series_code'), 'valiv');
            assert.notEqual(await harness.connection.prepare(
                `SELECT to_regclass('public.fudaba_series_tags') AS table_name`
            ).first<string>('table_name'), null);
        });
    });
}

// fudaba-card-claim-contract.test.ts
{
    function registeredFields(favoriteIdolIds: string) {
        return {
            producerName: 'Producer',
            displayName: 'My card',
            seriesCode: '765',
            favoriteIdolIds,
            accent: '#dc2626',
            bio: '',
            tradeNote: '',
            available: 'true'
        };
    }

    test.describe('Fudaba card claims', () => {
        test('registered card fields accept ordered multi-idol JSON and reject invalid sets', () => {
            assert.deepEqual(
                parseFudabaCardCreateFields(registeredFields('[3,1,2]')).favoriteIdolIds,
                [3, 1, 2]
            );
            for (const favoriteIdolIds of ['[]', '[1,1]', '[0]', 'not-json']) {
                assert.throws(
                    () => parseFudabaCardCreateFields(registeredFields(favoriteIdolIds)),
                    /favoriteIdolIds/
                );
            }
            assert.throws(
                () => parseFudabaCardCreateFields({
                    ...registeredFields('[1]'),
                    favoriteIdol: 'legacy scalar'
                }),
                /未知字段/
            );
        });

        test('legacy card claims accept cross-series selections and enforce 1..20 unique idols', () => {
            assert.deepEqual(parseLegacyCardClaim({
                targetCardId: null,
                seriesCode: '765',
                favoriteIdolIds: [900_001, 900_002],
                message: 'same producer'
            }), {
                targetCardId: null,
                seriesCode: '765',
                favoriteIdolIds: [900_001, 900_002],
                message: 'same producer'
            });
            for (const favoriteIdolIds of [
                [],
                [1, 1],
                [0],
                Array.from({ length: 21 }, (_, index) => index + 1)
            ]) {
                assert.throws(() => parseLegacyCardClaim({
                    targetCardId: null,
                    seriesCode: '765',
                    favoriteIdolIds,
                    message: ''
                }), /favoriteIdolIds/);
            }
        });

        test('namecard and claim views expose structured idol and claim metadata', () => {
            const publicCard = toPublicNamecardResponse({
                id: 7,
                image1_url: '/uploads/namecard/original/front.webp',
                image2_url: '/uploads/namecard/original/back.webp',
                status: 'approved',
                created_at: '2026-08-16T19:30:00.000Z',
                series_code: '765',
                favorite_idols: [{
                    idol_id: 900_001,
                    agency_code: '765',
                    name_cn: '测试春香',
                    display_order: 0
                }],
                claim_status: 'pending',
                viewer_claim_state: 'pending',
                claimer_name: null
            });
            assert.equal(publicCard.seriesCode, '765');
            assert.deepEqual(publicCard.favoriteIdols, [{
                id: 900_001,
                name: '测试春香',
                seriesCode: '765'
            }]);
            assert.equal(publicCard.claimStatus, 'pending');
            assert.equal(publicCard.viewerClaimState, 'pending');
            assert.equal(publicCard.claimerName, null);

            const historicalCard = toPublicNamecardResponse({
                id: 8,
                image1_url: '/uploads/namecard/original/front.webp',
                image2_url: '/uploads/namecard/original/back.webp',
                status: 'approved',
                created_at: null
            });
            assert.equal(historicalCard.seriesCode, null);
            assert.deepEqual(historicalCard.favoriteIdols, []);
            assert.equal(historicalCard.claimStatus, 'unclaimed');
            assert.equal(historicalCard.claimerName, null);

            const claimedCard = toPublicNamecardResponse({
                id: 9,
                image1_url: '/uploads/namecard/original/front.webp',
                image2_url: '/uploads/namecard/original/back.webp',
                status: 'approved',
                created_at: null,
                claim_status: 'claimed',
                claimer_name: '  Producer primary  '
            });
            assert.equal(claimedCard.claimerName, 'Producer primary');

            const claim: FudabaCardClaimRecord = {
                id: 'claim-1',
                legacy_card_id: 7,
                claimant_account_id: 'account-1',
                target_card_id: null,
                series_code: '765',
                state: 'pending',
                message: '',
                review_note: '',
                reviewed_by: null,
                reviewed_at: null,
                revision: 0,
                created_at: '2026-08-16T19:30:00.000Z',
                updated_at: '2026-08-16T19:30:00.000Z',
                favorite_idols: [{
                    idol_id: 900_001,
                    agency_code: '765',
                    name_cn: '测试春香',
                    display_order: 0
                }]
            };
            assert.deepEqual(fudabaCardClaimView(claim).favoriteIdols, [{
                id: 900_001,
                name: '测试春香',
                seriesCode: '765'
            }]);
        });
    });
}

// fudaba-card-interaction-routes.test.ts
{
    const ACCOUNT_ID = 'interaction-account';
    const TOKEN = 'interaction-access-token';
    const CSRF = 'interaction-csrf-secret';
    const CARD_ID = 'interaction-card';
    const CREATED_AT = '2026-08-02T00:00:00.000Z';

    class PublicMediaStorage implements ObjectStorage {
        async createPublicReadUrl(key: string): Promise<string | null> {
            return `https://media.example.test/${key}`;
        }
        async get(): Promise<StoredObject | null> {
            return null;
        }
        async put(
            _key: string,
            body: Uint8Array,
            options: PutObjectOptions = {}
        ): Promise<StoredObject> {
            return {
                body,
                size: body.byteLength,
                contentType: options.contentType || 'application/octet-stream',
                etag: 'unused'
            };
        }
        async delete(): Promise<void> {}
        async exists(): Promise<boolean> {
            return false;
        }
        async copy(): Promise<void> {}
        async move(): Promise<void> {}
        async list(): Promise<ListedObject[]> {
            return [];
        }
        async deletePrefix(): Promise<void> {}
    }

    class ControlledRateLimiter implements RateLimiter {
        readonly deniedBuckets = new Set<string>();

        async consume(
            bucket: string,
            _key: string,
            limit: number
        ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
            const denied = this.deniedBuckets.has(bucket);
            return {
                allowed: !denied,
                remaining: denied ? 0 : limit - 1,
                resetAt: Date.now() + 60_000
            };
        }
    }

    function publicCard(
        overrides: Partial<FudabaPublicCardRecord> = {}
    ): FudabaPublicCardRecord {
        return {
            id: CARD_ID,
            producer_name: 'Producer A',
            display_name: 'Card A',
            series_code: '765',
            favorite_idol: 'Haruka',
            favorite_idols: [],
            front_object_key: 'public/cards/card-a/front.webp',
            back_object_key: 'public/cards/card-a/back.webp',
            accent: '#4f64dd',
            bio: 'Public bio',
            trade_note: 'Trade note',
            available: true,
            source_url: null,
            source_label: null,
            source_credit: null,
            created_at: CREATED_AT,
            like_count: 2,
            favorite_count: 1,
            viewer_liked: false,
            viewer_favorited: false,
            ...overrides
        };
    }

    interface FixtureOptions {
        accountStatus?: PlatformAccountStatus;
        writeEnabled?: boolean;
    }

    class InteractionFixture {
        readonly accountStatus: PlatformAccountStatus;
        readonly writeEnabled: boolean;
        readonly rateLimiter = new ControlledRateLimiter();
        readonly interactionInputs: Array<
            Parameters<FudabaRepository['setCardInteraction']>[0]
        > = [];
        readonly cardListInputs: ListFudabaPublicCardsInput[] = [];
        readonly likes = new Set<string>();
        readonly favorites = new Set<string>();
        readonly app: ReturnType<typeof createHonoApp>;

        constructor(options: FixtureOptions = {}) {
            this.accountStatus = options.accountStatus ?? 'active';
            this.writeEnabled = options.writeEnabled ?? true;
            this.app = createHonoApp(() => this.runtime());
        }

        private state(): FudabaCardInteractionStateRecord {
            return {
                like_count: 2 + (this.likes.has(ACCOUNT_ID) ? 1 : 0),
                favorite_count: 1 + (this.favorites.has(ACCOUNT_ID) ? 1 : 0),
                viewer_liked: this.likes.has(ACCOUNT_ID),
                viewer_favorited: this.favorites.has(ACCOUNT_ID)
            };
        }

        readonly fudaba = {
            setCardInteraction: async (
                input: Parameters<FudabaRepository['setCardInteraction']>[0]
            ) => {
                this.interactionInputs.push(input);
                if (input.cardId !== CARD_ID) return false;
                const set = input.kind === 'like' ? this.likes : this.favorites;
                if (input.active) return !set.has(input.accountId) &&
                    Boolean(set.add(input.accountId));
                return set.delete(input.accountId);
            },
            findPublicCardInteractions: async (
                cardId: string,
                viewerAccountId: string | null
            ) => {
                if (cardId !== CARD_ID) return null;
                assert.equal(viewerAccountId, ACCOUNT_ID);
                return this.state();
            },
            listPublicCards: async (input: ListFudabaPublicCardsInput) => {
                this.cardListInputs.push(input);
                if (input.favoritedByAccountId !== ACCOUNT_ID) return [];
                return this.favorites.has(ACCOUNT_ID)
                    ? [
                          publicCard({
                              viewer_favorited: true,
                              favorite_count: 2
                          })
                      ]
                    : [];
            }
        } as unknown as FudabaRepository;

        private runtime(): RuntimeServices {
            const now = Date.now();
            return {
                fudaba: this.fudaba,
                storage: new PublicMediaStorage(),
                rateLimiter: this.rateLimiter,
                platformTokens: {
                    async sign() {
                        return TOKEN;
                    },
                    async verify(token: string) {
                        if (token !== TOKEN) throw new Error('invalid token');
                        return {
                            iss: 'imsweb' as const,
                            aud: 'ims-platform' as const,
                            kind: 'platform' as const,
                            id: ACCOUNT_ID,
                            tokenVersion: 0,
                            sessionId: 'interaction-session',
                            csrfSecret: CSRF,
                            jti: 'interaction-access',
                            iat: Math.floor(now / 1000),
                            exp: Math.floor(now / 1000) + 900
                        };
                    }
                },
                platformAccounts: {
                    findRefreshSessionById: async (id: string) =>
                        id === 'interaction-session'
                            ? {
                                  id,
                                  account_id: ACCOUNT_ID,
                                  token_hash: 'hash',
                                  previous_token_hash: null,
                                  csrf_hash: fixtureSha256Hex(CSRF),
                                  expires_at: now + 60_000,
                                  created_at: now,
                                  updated_at: now,
                                  revoked_at: null
                              }
                            : null,
                    findAccountWithProfileById: async (id: string) =>
                        id === ACCOUNT_ID
                            ? {
                                  account: {
                                      id,
                                      status: this.accountStatus,
                                      token_version: 0,
                                      created_at: now,
                                      updated_at: now,
                                      deleted_at: null
                                  },
                                  profile: {
                                      account_id: id,
                                      display_name: 'Interaction Account',
                                      avatar_object_key: null,
                                      avatar_external_url: null,
                                      home_city: null,
                                      bio: '',
                                      updated_at: now
                                  }
                              }
                            : null,
                    revokeRefreshSession: async () => true
                } as unknown as NonNullable<RuntimeServices['platformAccounts']>,
                config: {
                    fudabaWriteEnabled: this.writeEnabled,
                    fudabaPublicReadEnabled: true
                }
            };
        }
    }

    function bearerHeaders(): Record<string, string> {
        return bearerTokenHeaders(TOKEN);
    }

    function cookieHeaders(includeCsrfHeader: boolean): Record<string, string> {
        return cookieCsrfHeaders([
            [PLATFORM_ACCESS_TOKEN_COOKIE, TOKEN],
            [PLATFORM_CSRF_TOKEN_COOKIE, CSRF]
        ], includeCsrfHeader ? CSRF : null);
    }

    function interactionPath(kind: 'like' | 'favorite', cardId = CARD_ID): string {
        return `http://ims.test/api/community/exchange/cards/${cardId}/${kind}`;
    }

    test.describe('card interaction routes', () => {
        test('enforce the write gate, auth, CSRF, and rate limit',
            async () => {
                const disabled = new InteractionFixture({ writeEnabled: false });
                assert.equal((await disabled.app.request(interactionPath('like'), {
                    method: 'PUT',
                    headers: bearerHeaders()
                })).status, 404);

                const fixture = new InteractionFixture();
                assert.equal((await fixture.app.request(interactionPath('like'), {
                    method: 'PUT'
                })).status, 401);
                assert.equal((await fixture.app.request(interactionPath('like'), {
                    method: 'PUT',
                    headers: cookieHeaders(false)
                })).status, 403);

                const restricted = new InteractionFixture({
                    accountStatus: 'restricted'
                });
                assert.equal((await restricted.app.request(interactionPath('favorite'), {
                    method: 'PUT',
                    headers: bearerHeaders()
                })).status, 403);

                const limited = new InteractionFixture();
                limited.rateLimiter.deniedBuckets.add('platform-write-account');
                assert.equal((await limited.app.request(interactionPath('like'), {
                    method: 'PUT',
                    headers: bearerHeaders()
                })).status, 429);

                assert.deepEqual(fixture.interactionInputs, []);
            });

        test('liking and unliking a card round-trips through the repository',
            async () => {
                const fixture = new InteractionFixture();
                const liked = await fixture.app.request(interactionPath('like'), {
                    method: 'PUT',
                    headers: cookieHeaders(true)
                });
                assert.equal(liked.status, 200);
                const likedBody = await contractJson(
                    liked,
                    fudabaCardInteractionResponseSchema
                );
                assert.deepEqual(likedBody, {
                    success: true,
                    cardId: CARD_ID,
                    interactions: {
                        likes: 3,
                        favorites: 1,
                        viewerLiked: true,
                        viewerFavorited: false
                    }
                });

                const unliked = await fixture.app.request(interactionPath('like'), {
                    method: 'DELETE',
                    headers: cookieHeaders(true)
                });
                assert.equal(unliked.status, 200);
                assert.deepEqual(await contractJson(unliked, fudabaCardInteractionResponseSchema), {
                    success: true,
                    cardId: CARD_ID,
                    interactions: {
                        likes: 2,
                        favorites: 1,
                        viewerLiked: false,
                        viewerFavorited: false
                    }
                });

                assert.deepEqual(
                    fixture.interactionInputs.map(({ kind, active, cardId, accountId }) =>
                        ({ kind, active, cardId, accountId })),
                    [
                        {
                            kind: 'like',
                            active: true,
                            cardId: CARD_ID,
                            accountId: ACCOUNT_ID
                        },
                        {
                            kind: 'like',
                            active: false,
                            cardId: CARD_ID,
                            accountId: ACCOUNT_ID
                        }
                    ]
                );
                for (const input of fixture.interactionInputs) {
                    assert.equal(
                        new Date(input.createdAt).toISOString(),
                        input.createdAt
                    );
                }
            });

        test('interactions on unknown cards stay 404 and never leak repository state',
            async () => {
                const fixture = new InteractionFixture();
                const missing = await fixture.app.request(
                    interactionPath('favorite', 'other-card'),
                    { method: 'PUT', headers: cookieHeaders(true) }
                );
                assert.equal(missing.status, 404);
                assert.deepEqual(await contractJson(missing, fudabaErrorResponseSchema), {
                    success: false,
                    code: 'FUDABA_CARD_INTERACTION_NOT_FOUND'
                });

                const invalid = await fixture.app.request(
                    interactionPath('favorite', 'bad%2Fcard'),
                    { method: 'PUT', headers: cookieHeaders(true) }
                );
                assert.equal(invalid.status, 404);
            });

        test('the favourite collection lists only cards the viewer favourited',
            async () => {
                const fixture = new InteractionFixture();
                const empty = await fixture.app.request(
                    'http://ims.test/api/community/exchange/me/favorites?limit=12',
                    { headers: bearerHeaders() }
                );
                assert.equal(empty.status, 200);
                assert.deepEqual(await empty.json(), {
                    items: [],
                    pageInfo: { hasNextPage: false, nextCursor: null }
                });

                assert.equal((await fixture.app.request(
                    interactionPath('favorite'),
                    { method: 'PUT', headers: cookieHeaders(true) }
                )).status, 200);

                const collection = await fixture.app.request(
                    'http://ims.test/api/community/exchange/me/favorites?limit=12',
                    { headers: bearerHeaders() }
                );
                assert.equal(collection.status, 200);
                const body = await contractJson(collection, fudabaCardPageSchema);
                assert.equal(body.items.length, 1);
                assert.equal(body.items[0].id, CARD_ID);
                assert.deepEqual(body.items[0].interactions, {
                    likes: 2,
                    favorites: 2,
                    viewerLiked: false,
                    viewerFavorited: true
                });
                assert.equal(
                    fixture.cardListInputs.at(-1)?.favoritedByAccountId,
                    ACCOUNT_ID
                );
                assert.equal(fixture.cardListInputs.at(-1)?.viewerAccountId, ACCOUNT_ID);

                const anonymous = await fixture.app.request(
                    'http://ims.test/api/community/exchange/me/favorites'
                );
                assert.equal(anonymous.status, 401);
            });
    });
}

// fudaba-card-placement-repository.test.ts
{
    const CREATED_AT = '2026-08-03T00:00:00.000Z';
    const UPDATED_AT = '2026-08-03T00:01:00.000Z';
    const ARCHIVED_AT = '2026-08-03T00:02:00.000Z';

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined
    };

    interface Fixture {
        database: ManagedSqlDatabase;
        repository: SqlFudabaRepository;
        dialect: 'postgresql';
    }

    async function createFixture(
        dialect: Fixture['dialect']
    ): Promise<Fixture> {
        const harness = await createPostgresTestHarness();
        const repository = new SqlFudabaRepository(
            harness.connection,
            initializedPostgresSchema
        );
        onTestFinished(() => harness.close());
        await repository.initialize();
        await seedCanonicalFudabaAgencies(harness.connection);
        return { database: harness.connection, repository, dialect };
    }

    async function seedAccount(
        fixture: Fixture,
        id: string,
        status: PlatformAccountStatus = 'active'
    ): Promise<void> {
        await fixture.database.prepare(
            `INSERT INTO platform_accounts
            (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, 0, 1700000000000, 1700000000000, ?)`
        ).bind(id, status, status === 'deleted' ? 1700000000000 : null).run();
    }

    function office(
        id: string,
        ownerAccountId: string,
        overrides: Partial<NewFudabaOfficeInput> = {}
    ): NewFudabaOfficeInput {
        return {
            id,
            ownerAccountId,
            slug: id,
            name: `Office ${id}`,
            intro: '',
            city: 'Shanghai',
            address: 'Private address',
            latitude: 31.2304,
            longitude: 121.4737,
            accent: '#ef5b6c',
            coverObjectKey: null,
            isOpen: true,
            visitorCount: 0,
            status: 'active',
            revision: 0,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
            archivedAt: null,
            seriesCodes: ['765'],
            ...overrides
        };
    }

    function card(
        id: string,
        ownerAccountId: string,
        overrides: Partial<NewFudabaCardInput> = {}
    ): NewFudabaCardInput {
        return {
            id,
            ownerAccountId,
            producerName: `Producer ${ownerAccountId}`,
            displayName: `Card ${id}`,
            seriesCode: '765',
            favoriteIdol: 'Haruka',
            favoriteIdolIds: [900_001],
            frontObjectKey: `community/fudaba/cards/${id}/front.webp`,
            backObjectKey: `community/fudaba/cards/${id}/back.webp`,
            accent: '#4f64dd',
            bio: '',
            tradeNote: '',
            available: true,
            sourceUrl: null,
            sourceLabel: null,
            sourceCredit: null,
            mediaRightsStatus: 'approved',
            publicationStatus: 'published',
            revision: 0,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
            deletedAt: null,
            ...overrides
        };
    }

    function placementInput(
        officeId: string,
        cardId: string,
        ownerAccountId: string,
        expectedRevision: number | null,
        updatedAt = CREATED_AT
    ) {
        return {
            officeId,
            cardId,
            ownerAccountId,
            positionX: 12.5,
            positionY: 87.25,
            rotation: -4.5,
            zIndex: 8,
            expectedRevision,
            updatedAt
        };
    }

    async function assertCardPlacementRepository(
        dialect: Fixture['dialect']
    ): Promise<void> {
        const fixture = await createFixture(dialect);
        const ownerId = `${dialect}-placement-owner`;
        const otherId = `${dialect}-placement-other`;
        const officeId = `${dialect}-placement-office`;
        const cardId = `${dialect}-placement-card`;
        const removableCardId = `${dialect}-removable-card`;
        const closedRemovalCardId = `${dialect}-closed-removal-card`;
        const closedCreateCardId = `${dialect}-closed-create-card`;
        const closedOfficeId = `${dialect}-closed-office`;
        const restrictedOfficeId = `${dialect}-restricted-owner-office`;
        const restrictedOfficeOwnerId = `${dialect}-restricted-office-owner`;
        const suspendedOfficeId = `${dialect}-suspended-owner-office`;
        const suspendedOfficeOwnerId = `${dialect}-suspended-office-owner`;
        await seedAccount(fixture, ownerId);
        await seedAccount(fixture, otherId);
        await seedAccount(fixture, restrictedOfficeOwnerId, 'restricted');
        await seedAccount(fixture, suspendedOfficeOwnerId, 'suspended');
        await fixture.repository.createOffice(office(officeId, ownerId));
        await fixture.repository.createOffice(office(closedOfficeId, otherId, {
            isOpen: false
        }));
        await fixture.repository.createOffice(office(
            restrictedOfficeId,
            restrictedOfficeOwnerId
        ));
        await fixture.repository.createOffice(office(
            suspendedOfficeId,
            suspendedOfficeOwnerId
        ));
        await fixture.repository.createCard(card(cardId, ownerId));
        await fixture.repository.createCard(card(removableCardId, ownerId));
        await fixture.repository.createCard(card(closedRemovalCardId, ownerId));
        await fixture.repository.createCard(card(closedCreateCardId, ownerId));
        await fixture.repository.createCard(card(`${dialect}-other-card`, otherId));
        await fixture.repository.createCard(card(`${dialect}-pending-card`, ownerId, {
            publicationStatus: 'pending'
        }));
        await fixture.repository.createCard(card(`${dialect}-deleted-card`, ownerId, {
            publicationStatus: 'pending',
            mediaRightsStatus: 'unknown',
            updatedAt: UPDATED_AT,
            deletedAt: UPDATED_AT
        }));
        await fixture.repository.createCard(card(`${dialect}-disabled-card`, ownerId, {
            seriesCode: 'sidem'
        }));

        const created = await fixture.repository.saveCardPlacementForOwner(
            placementInput(officeId, cardId, ownerId, null)
        );
        assert.equal(created.status, 'saved');
        if (created.status !== 'saved') return;
        assert.equal(created.created, true);
        assert.deepEqual(created.placement, {
            office_id: officeId,
            card_id: cardId,
            pinned_at: CREATED_AT,
            position_x: 12.5,
            position_y: 87.25,
            rotation: -4.5,
            z_index: 8,
            revision: 0,
            updated_at: CREATED_AT
        });

        assert.deepEqual(
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(officeId, cardId, ownerId, null)
            ),
            { status: 'conflict', revision: 0 }
        );
        assert.deepEqual(
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(officeId, cardId, ownerId, 3, UPDATED_AT)
            ),
            { status: 'conflict', revision: 0 }
        );
        assert.deepEqual(
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(officeId, cardId, otherId, 0, UPDATED_AT)
            ),
            { status: 'unavailable' }
        );
        assert.deepEqual(
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(closedOfficeId, cardId, ownerId, null)
            ),
            { status: 'unavailable' }
        );
        assert.deepEqual(
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(suspendedOfficeId, cardId, ownerId, null)
            ),
            { status: 'unavailable' }
        );
        const restrictedOwnerPlacement =
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(restrictedOfficeId, cardId, ownerId, null)
            );
        assert.equal(restrictedOwnerPlacement.status, 'saved');

        const updated = await fixture.repository.saveCardPlacementForOwner({
            ...placementInput(officeId, cardId, ownerId, 0, UPDATED_AT),
            positionX: 100,
            positionY: 0,
            rotation: 12,
            zIndex: 999
        });
        assert.equal(updated.status, 'saved');
        if (updated.status !== 'saved') return;
        assert.equal(updated.created, false);
        assert.deepEqual(updated.placement, {
            office_id: officeId,
            card_id: cardId,
            pinned_at: CREATED_AT,
            position_x: 100,
            position_y: 0,
            rotation: 12,
            z_index: 999,
            revision: 1,
            updated_at: UPDATED_AT
        });

        const ownerView = await fixture.repository.findPublicOfficeBySlug(
            officeId,
            ownerId
        );
        const placedCard = ownerView?.cards.find(({ id }) => id === cardId);
        assert.ok(placedCard);
        assert.equal(placedCard.viewer_owned, true);
        assert.equal(placedCard.revision, 1);
        assert.equal(placedCard.updated_at, UPDATED_AT);
        assert.equal(
            (await fixture.repository.findPublicOfficeBySlug(officeId, otherId))
                ?.cards.find(({ id }) => id === cardId)?.viewer_owned,
            false
        );

        await fixture.database.prepare(
            'UPDATE agencies SET wiki_enabled=? WHERE code=?'
        ).bind(false, 'sidem').run();
        for (const unavailable of [
            placementInput(officeId, `${dialect}-other-card`, ownerId, null),
            placementInput(officeId, `${dialect}-pending-card`, ownerId, null),
            placementInput(officeId, `${dialect}-deleted-card`, ownerId, null),
            placementInput(officeId, `${dialect}-disabled-card`, ownerId, null),
            placementInput(`${dialect}-missing-office`, cardId, ownerId, null)
        ]) {
            assert.deepEqual(
                await fixture.repository.saveCardPlacementForOwner(unavailable),
                { status: 'unavailable' }
            );
        }

        assert.deepEqual(await fixture.repository.removeCardPlacementForOwner({
            officeId,
            cardId,
            ownerAccountId: ownerId,
            expectedRevision: 0
        }), { status: 'conflict', revision: 1 });
        assert.deepEqual(await fixture.repository.removeCardPlacementForOwner({
            officeId,
            cardId,
            ownerAccountId: otherId,
            expectedRevision: 1
        }), { status: 'unavailable' });

        const exchange = await fixture.repository.createExchangeRequest({
            id: `${dialect}-placement-exchange`,
            officeId,
            requesterAccountId: otherId,
            recipientAccountId: ownerId,
            wantedCardId: cardId,
            offeredCardId: null,
            note: '',
            createdAt: UPDATED_AT
        });
        assert.ok(exchange);
        assert.deepEqual(await fixture.repository.removeCardPlacementForOwner({
            officeId,
            cardId,
            ownerAccountId: ownerId,
            expectedRevision: 0
        }), { status: 'conflict', revision: 1 });
        assert.deepEqual(await fixture.repository.removeCardPlacementForOwner({
            officeId,
            cardId,
            ownerAccountId: ownerId,
            expectedRevision: 1
        }), { status: 'in-use', revision: 1 });

        const removable = await fixture.repository.saveCardPlacementForOwner(
            placementInput(officeId, removableCardId, ownerId, null)
        );
        assert.equal(removable.status, 'saved');
        const closedRemoval = await fixture.repository.saveCardPlacementForOwner(
            placementInput(officeId, closedRemovalCardId, ownerId, null)
        );
        assert.equal(closedRemoval.status, 'saved');
        await fixture.database.prepare(
            'UPDATE fudaba_offices SET is_open=? WHERE id=?'
        ).bind(false, officeId).run();
        assert.deepEqual(
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(officeId, cardId, ownerId, 1, ARCHIVED_AT)
            ),
            { status: 'unavailable' }
        );
        assert.deepEqual(
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(officeId, closedCreateCardId, ownerId, null, ARCHIVED_AT)
            ),
            { status: 'unavailable' }
        );
        assert.deepEqual(await fixture.repository.removeCardPlacementForOwner({
            officeId,
            cardId: closedRemovalCardId,
            ownerAccountId: ownerId,
            expectedRevision: 0
        }), { status: 'removed', revision: 1 });
        await fixture.database.prepare(
            'UPDATE fudaba_offices SET is_open=? WHERE id=?'
        ).bind(true, officeId).run();
        assert.equal(await fixture.repository.updateOfficeStatusForOwner({
            officeId,
            ownerAccountId: ownerId,
            status: 'archived',
            archivedAt: ARCHIVED_AT,
            updatedAt: ARCHIVED_AT,
            expectedRevision: 0
        }), true);
        assert.deepEqual(
            await fixture.repository.saveCardPlacementForOwner(
                placementInput(officeId, removableCardId, ownerId, 0, ARCHIVED_AT)
            ),
            { status: 'unavailable' }
        );
        await fixture.database.prepare(
            `UPDATE fudaba_cards
         SET publication_status='hidden', revision=revision+1, updated_at=?
         WHERE id=?`
        ).bind(ARCHIVED_AT, removableCardId).run();
        assert.deepEqual(await fixture.repository.removeCardPlacementForOwner({
            officeId,
            cardId: removableCardId,
            ownerAccountId: ownerId,
            expectedRevision: 0
        }), { status: 'removed', revision: 1 });
        assert.equal(await fixture.database.prepare(
            `SELECT COUNT(*) AS count FROM fudaba_office_cards
         WHERE office_id=? AND card_id=?`
        ).bind(officeId, removableCardId).first<number>('count'), 0);
    }

    describe('Fudaba card placement repository', () => {
        postgresTest('real PostgreSQL enforces the same Fudaba card placement contract', async () => {
            await assertCardPlacementRepository('postgresql');
        });
    });
}

// fudaba-card-placement-routes.test.ts
{
    const ACCOUNT_ID = 'placement-owner';
    const TOKEN = 'placement-access-token';
    const CSRF = 'placement-csrf-secret';
    const OFFICE_ID = 'placement-office';
    const CARD_ID = 'placement-card';

    class ControlledRateLimiter implements RateLimiter {
        readonly deniedBuckets = new Set<string>();
        readonly calls: Array<{
            bucket: string;
            key: string;
            limit: number;
            windowSeconds: number;
        }> = [];

        async consume(
            bucket: string,
            key: string,
            limit: number,
            windowSeconds: number
        ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
            this.calls.push({ bucket, key, limit, windowSeconds });
            const denied = this.deniedBuckets.has(bucket);
            return {
                allowed: !denied,
                remaining: denied ? 0 : limit - 1,
                resetAt: Date.now() + 60_000
            };
        }
    }

    interface FixtureOptions {
        accountStatus?: PlatformAccountStatus;
        officeOpen?: boolean;
        officeOwnerStatus?: PlatformAccountStatus;
        writeEnabled?: boolean;
    }

    class PlacementRouteFixture {
        readonly accountStatus: PlatformAccountStatus;
        readonly writeEnabled: boolean;
        officeOpen: boolean;
        officeOwnerStatus: PlatformAccountStatus;
        readonly rateLimiter = new ControlledRateLimiter();
        readonly placements = new Map<string, FudabaCardPlacementRecord>();
        readonly saveInputs: Array<Parameters<
            FudabaRepository['saveCardPlacementForOwner']
        >[0]> = [];
        readonly removeInputs: Array<Parameters<
            FudabaRepository['removeCardPlacementForOwner']
        >[0]> = [];
        inUse = false;
        readonly app: ReturnType<typeof createHonoApp>;

        constructor(options: FixtureOptions = {}) {
            this.accountStatus = options.accountStatus ?? 'active';
            this.officeOpen = options.officeOpen ?? true;
            this.officeOwnerStatus = options.officeOwnerStatus ?? 'active';
            this.writeEnabled = options.writeEnabled ?? true;
            this.app = createHonoApp(() => this.runtime());
        }

        private key(officeId: string, cardId: string): string {
            return `${officeId}\u0000${cardId}`;
        }

        readonly fudaba = {
            saveCardPlacementForOwner: async (
                input: Parameters<FudabaRepository['saveCardPlacementForOwner']>[0]
            ) => {
                this.saveInputs.push(input);
                if (
                    input.ownerAccountId !== ACCOUNT_ID ||
                    input.officeId !== OFFICE_ID || input.cardId === 'other-card' ||
                    !this.officeOpen ||
                    !['active', 'restricted'].includes(this.officeOwnerStatus)
                ) {
                    return { status: 'unavailable' as const };
                }
                const key = this.key(input.officeId, input.cardId);
                const current = this.placements.get(key);
                if (input.expectedRevision === null) {
                    if (current) {
                        return {
                            status: 'conflict' as const,
                            revision: current.revision
                        };
                    }
                    const placement: FudabaCardPlacementRecord = {
                        office_id: input.officeId,
                        card_id: input.cardId,
                        pinned_at: input.updatedAt,
                        position_x: input.positionX,
                        position_y: input.positionY,
                        rotation: input.rotation,
                        z_index: input.zIndex,
                        revision: 0,
                        updated_at: input.updatedAt
                    };
                    this.placements.set(key, placement);
                    return { status: 'saved' as const, placement, created: true };
                }
                if (!current) return { status: 'unavailable' as const };
                if (current.revision !== input.expectedRevision) {
                    return {
                        status: 'conflict' as const,
                        revision: current.revision
                    };
                }
                const placement: FudabaCardPlacementRecord = {
                    ...current,
                    position_x: input.positionX,
                    position_y: input.positionY,
                    rotation: input.rotation,
                    z_index: input.zIndex,
                    revision: current.revision + 1,
                    updated_at: input.updatedAt
                };
                this.placements.set(key, placement);
                return { status: 'saved' as const, placement, created: false };
            },
            removeCardPlacementForOwner: async (
                input: Parameters<FudabaRepository['removeCardPlacementForOwner']>[0]
            ) => {
                this.removeInputs.push(input);
                if (
                    input.ownerAccountId !== ACCOUNT_ID ||
                    input.officeId !== OFFICE_ID || input.cardId === 'other-card'
                ) {
                    return { status: 'unavailable' as const };
                }
                const key = this.key(input.officeId, input.cardId);
                const current = this.placements.get(key);
                if (!current) return { status: 'unavailable' as const };
                if (current.revision !== input.expectedRevision) {
                    return {
                        status: 'conflict' as const,
                        revision: current.revision
                    };
                }
                if (this.inUse) {
                    return { status: 'in-use' as const, revision: current.revision };
                }
                this.placements.delete(key);
                return {
                    status: 'removed' as const,
                    revision: current.revision + 1
                };
            }
        } as unknown as FudabaRepository;

        private runtime(): RuntimeServices {
            const now = Date.now();
            return {
                fudaba: this.fudaba,
                rateLimiter: this.rateLimiter,
                platformTokens: {
                    async sign() { return TOKEN; },
                    async verify(token: string) {
                        if (token !== TOKEN) throw new Error('invalid placement token');
                        return {
                            iss: 'imsweb' as const,
                            aud: 'ims-platform' as const,
                            kind: 'platform' as const,
                            id: ACCOUNT_ID,
                            tokenVersion: 0,
                            sessionId: 'placement-session',
                            csrfSecret: CSRF,
                            jti: 'placement-access',
                            iat: Math.floor(now / 1000),
                            exp: Math.floor(now / 1000) + 900
                        };
                    }
                },
                platformAccounts: {
                    findRefreshSessionById: async (id: string) => id === 'placement-session'
                        ? {
                            id,
                            account_id: ACCOUNT_ID,
                            token_hash: 'hash',
                            previous_token_hash: null,
                            csrf_hash: csrfHash(CSRF),
                            expires_at: now + 60_000,
                            created_at: now,
                            updated_at: now,
                            revoked_at: null
                        }
                        : null,
                    findAccountWithProfileById: async (id: string) => id === ACCOUNT_ID
                        ? {
                            account: {
                                id,
                                status: this.accountStatus,
                                token_version: 0,
                                created_at: now,
                                updated_at: now,
                                deleted_at: this.accountStatus === 'deleted' ? now : null
                            },
                            profile: {
                                account_id: id,
                                display_name: 'Placement Owner',
                                avatar_object_key: null,
                                avatar_external_url: null,
                                home_city: null,
                                bio: '',
                                updated_at: now
                            }
                        }
                        : null,
                    revokeRefreshSession: async () => true
                } as unknown as NonNullable<RuntimeServices['platformAccounts']>,
                config: { fudabaWriteEnabled: this.writeEnabled }
            };
        }
    }

    function bearerHeaders(extra: Record<string, string> = {}): Record<string, string> {
        return bearerTokenHeaders(TOKEN, extra);
    }

    function cookieHeaders(includeHeader: boolean): Record<string, string> {
        return cookieCsrfHeaders([
            [PLATFORM_ACCESS_TOKEN_COOKIE, TOKEN],
            [PLATFORM_CSRF_TOKEN_COOKIE, CSRF]
        ], includeHeader ? CSRF : null);
    }

    function placementBody(expectedRevision: number | null): Record<string, unknown> {
        return {
            x: 25.5,
            y: 74.5,
            rotation: -3,
            zIndex: 12,
            expectedRevision
        };
    }

    function path(cardId = CARD_ID): string {
        return `/api/community/exchange/offices/${OFFICE_ID}` +
            `/cards/${cardId}/placement`;
    }

    test.describe('card placement', () => {
        test('routes enforce write gate, Platform auth, active status, CSRF, and rate limit',
            async () => {
                const disabled = new PlacementRouteFixture({ writeEnabled: false });
                assert.equal((await disabled.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(null))
                })).status, 404);

                const fixture = new PlacementRouteFixture();
                assert.equal((await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(placementBody(null))
                })).status, 401);
                assert.equal((await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: {
                        ...cookieHeaders(false),
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify(placementBody(null))
                })).status, 403);

                const restricted = new PlacementRouteFixture({ accountStatus: 'restricted' });
                assert.equal((await restricted.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(null))
                })).status, 403);

                const limited = new PlacementRouteFixture();
                limited.rateLimiter.deniedBuckets.add('platform-write-account');
                assert.equal((await limited.app.request(`http://ims.test${path()}`, {
                    method: 'DELETE',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ expectedRevision: 0 })
                })).status, 429);
                assert.ok(limited.rateLimiter.calls.some((call) =>
                    call.bucket === 'platform-write-account' &&
                    call.key === ACCOUNT_ID && call.limit === 120 &&
                    call.windowSeconds === 3600
                ));
            });

        test('routes strictly validate geometry and expose create/update CAS DTOs',
            async () => {
                const fixture = new PlacementRouteFixture();
                const created = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(null))
                });
                assert.equal(created.status, 201);
                const createdBody = await contractJson(
                    created,
                    fudabaCardPlacementSaveResponseSchema
                );
                const pinnedAt = String(createdBody.placement.pinnedAt);
                assert.equal(new Date(pinnedAt).toISOString(), pinnedAt);
                assert.deepEqual(createdBody, {
                    success: true,
                    placement: {
                        pinnedAt,
                        x: 25.5,
                        y: 74.5,
                        rotation: -3,
                        zIndex: 12,
                        revision: 0,
                        updatedAt: pinnedAt
                    }
                });

                const duplicate = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(null))
                });
                assert.equal(duplicate.status, 409);
                assert.equal((await duplicate.json() as { revision: number }).revision, 0);

                for (const invalid of [
                    { ...placementBody(0), x: -0.01 },
                    { ...placementBody(0), y: 100.01 },
                    { ...placementBody(0), rotation: 12.01 },
                    { ...placementBody(0), zIndex: 1.5 },
                    { ...placementBody(0), expectedRevision: '0' },
                    { ...placementBody(0), expectedRevision: 2_147_483_648 },
                    { ...placementBody(0), unexpected: true }
                ]) {
                    const response = await fixture.app.request(`http://ims.test${path()}`, {
                        method: 'PUT',
                        headers: bearerHeaders({ 'content-type': 'application/json' }),
                        body: JSON.stringify(invalid)
                    });
                    assert.equal(response.status, 400);
                    if (
                        ('expectedRevision' in invalid &&
                            invalid.expectedRevision === 2_147_483_648) ||
                        'unexpected' in invalid
                    ) {
                        await contractJson(response, fudabaErrorResponseSchema);
                    }
                }

                const updated = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({
                        x: 0,
                        y: 100,
                        rotation: 12,
                        zIndex: 999,
                        expectedRevision: 0
                    })
                });
                assert.equal(updated.status, 200);
                const updatedBody = await contractJson(
                    updated,
                    fudabaCardPlacementSaveResponseSchema
                );
                assert.equal(updatedBody.placement.pinnedAt, pinnedAt);
                assert.equal(updatedBody.placement.revision, 1);
                assert.equal(updatedBody.placement.x, 0);
                assert.equal(updatedBody.placement.y, 100);

                const stale = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(0))
                });
                assert.equal(stale.status, 409);
                assert.deepEqual(await contractJson(stale, fudabaErrorResponseSchema), {
                    success: false,
                    code: 'FUDABA_CARD_PLACEMENT_CONFLICT',
                    revision: 1
                });
                assert.equal((await fixture.app.request(`http://ims.test${path('other-card')}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(null))
                })).status, 404);
                assert.equal((await fixture.app.request(
                    `http://ims.test${path('x'.repeat(129))}`,
                    {
                        method: 'PUT',
                        headers: bearerHeaders({ 'content-type': 'application/json' }),
                        body: JSON.stringify(placementBody(null))
                    }
                )).status, 404);
            });

        test('saves hide closed or non-public offices while deletion remains available',
            async () => {
                const notFound = {
                    success: false,
                    code: 'FUDABA_CARD_PLACEMENT_NOT_FOUND'
                };
                const closed = new PlacementRouteFixture({ officeOpen: false });
                const closedCreate = await closed.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(null))
                });
                assert.equal(closedCreate.status, 404);
                assert.deepEqual(await closedCreate.json(), notFound);

                const suspendedOwner = new PlacementRouteFixture({
                    officeOwnerStatus: 'suspended'
                });
                const suspendedCreate = await suspendedOwner.app.request(
                    `http://ims.test${path()}`,
                    {
                        method: 'PUT',
                        headers: bearerHeaders({ 'content-type': 'application/json' }),
                        body: JSON.stringify(placementBody(null))
                    }
                );
                assert.equal(suspendedCreate.status, 404);
                assert.deepEqual(await suspendedCreate.json(), notFound);

                const fixture = new PlacementRouteFixture();
                assert.equal((await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(null))
                })).status, 201);
                fixture.officeOpen = false;
                const closedUpdate = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(0))
                });
                assert.equal(closedUpdate.status, 404);
                assert.deepEqual(await closedUpdate.json(), notFound);

                const removed = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'DELETE',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ expectedRevision: 0 })
                });
                assert.equal(removed.status, 200);
                assert.deepEqual(await contractJson(removed, fudabaCardPlacementDeleteResponseSchema), {
                    success: true,
                    revision: 1
                });
            });

        test('DELETE enforces CAS, reports in-use state, and advances revision',
            async () => {
                const fixture = new PlacementRouteFixture();
                assert.equal((await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(placementBody(null))
                })).status, 201);

                const stale = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'DELETE',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ expectedRevision: 2 })
                });
                assert.equal(stale.status, 409);
                assert.equal((await stale.json() as { revision: number }).revision, 0);
                assert.equal((await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'DELETE',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ expectedRevision: '0' })
                })).status, 400);

                fixture.inUse = true;
                const inUse = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'DELETE',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ expectedRevision: 0 })
                });
                assert.equal(inUse.status, 409);
                assert.deepEqual(await contractJson(inUse, fudabaErrorResponseSchema), {
                    success: false,
                    code: 'FUDABA_CARD_PLACEMENT_IN_USE',
                    revision: 0
                });

                fixture.inUse = false;
                const removed = await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'DELETE',
                    headers: {
                        ...cookieHeaders(true),
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({ expectedRevision: 0 })
                });
                assert.equal(removed.status, 200);
                assert.deepEqual(await contractJson(removed, fudabaCardPlacementDeleteResponseSchema), {
                    success: true,
                    revision: 1
                });
                assert.equal((await fixture.app.request(`http://ims.test${path()}`, {
                    method: 'DELETE',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ expectedRevision: 1 })
                })).status, 404);
            });
    });
}

// fudaba-card-reaction-routes.test.ts
{
    const CARD_ID = 'card-reaction-1';
    const PATH = `http://ims.test/api/community/exchange/cards/${CARD_ID}/reactions`;

    class ControlledRateLimiter implements RateLimiter {
        private denied: string | null = null;

        denyBucket(bucket: string | null): void {
            this.denied = bucket;
        }

        async consume(
            bucket: string,
            _key: string,
            limit: number
        ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
            const allowed = this.denied !== bucket;
            return {
                allowed,
                remaining: allowed ? limit - 1 : 0,
                resetAt: Date.now() + 60_000
            };
        }
    }

    class ReactionFixture {
        readonly rateLimiter = new ControlledRateLimiter();
        readonly reactions = new Map<string, number>();
        publicReadEnabled = true;
        eligible = true;
        applyCalls: FudabaCardReactionInput[] = [];

        private repository(): FudabaRepository {
            return {
                listPublicCardReactions: async (
                    cardId: string
                ): Promise<FudabaCardReactionRecord[]> => {
                    if (cardId !== CARD_ID || !this.eligible) return [];
                    return [...this.reactions.entries()]
                        .map(([emoji, count]) => ({ emoji, count }))
                        .sort((left, right) => right.count - left.count);
                },
                applyPublicCardReaction: async (
                    input: FudabaCardReactionInput
                ): Promise<boolean> => {
                    this.applyCalls.push(input);
                    if (input.cardId !== CARD_ID || !this.eligible) return false;
                    const current = this.reactions.get(input.emoji) ?? 0;
                    const next = current + input.delta;
                    if (next <= 0) this.reactions.delete(input.emoji);
                    else this.reactions.set(input.emoji, next);
                    return true;
                }
            } as unknown as FudabaRepository;
        }

        runtime() {
            return {
                fudaba: this.repository(),
                rateLimiter: this.rateLimiter,
                config: {
                    fudabaPublicReadEnabled: this.publicReadEnabled
                }
            };
        }

        app() {
            return createHonoApp(() => this.runtime() as never);
        }
    }

    test.describe('exchange card reactions', () => {
        test('are listed for anonymous visitors', async () => {
            const fixture = new ReactionFixture();
            fixture.reactions.set('❤️', 3);
            fixture.reactions.set('🎉', 1);

            const response = await fixture.app().request(PATH);

            assert.equal(response.status, 200);
            const body = await contractJson(response, fudabaCardReactionsResponseSchema);
            assert.deepEqual(body.reactions, [
                { emoji: '❤️', count: 3 },
                { emoji: '🎉', count: 1 }
            ]);
        });

        test('increment and decrement anonymously', async () => {
            const fixture = new ReactionFixture();

            const added = await fixture.app().request(PATH, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ emoji: '❤️' })
            });
            assert.equal(added.status, 200);
            assert.deepEqual(
                (await contractJson(added, fudabaCardReactionsResponseSchema)).reactions,
                [{ emoji: '❤️', count: 1 }]
            );

            const removed = await fixture.app().request(PATH, {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ emoji: '❤️' })
            });
            assert.equal(removed.status, 200);
            assert.deepEqual(
                (await contractJson(removed, fudabaCardReactionsResponseSchema)).reactions,
                []
            );
            assert.deepEqual(fixture.applyCalls.map((call) => call.delta), [1, -1]);
        });

        test('reject unsupported emoji and unknown cards', async () => {
            const fixture = new ReactionFixture();

            const unsupported = await fixture.app().request(PATH, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ emoji: 'not-an-emoji' })
            });
            assert.equal(unsupported.status, 400);
            assert.deepEqual(
                await contractJson(unsupported, fudabaCardReactionErrorSchema),
                {
                    success: false,
                    code: 'FUDABA_CARD_REACTION_INVALID',
                    message: '表情不受支持'
                }
            );
            assert.deepEqual(fixture.applyCalls, []);

            fixture.eligible = false;
            const missing = await fixture.app().request(PATH, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ emoji: '❤️' })
            });
            assert.equal(missing.status, 404);
            assert.deepEqual(
                await contractJson(missing, fudabaCardReactionErrorSchema),
                { success: false, code: 'FUDABA_CARD_REACTION_NOT_FOUND' }
            );
        });

        test('share the namecard reaction rate limit', async () => {
            const fixture = new ReactionFixture();
            fixture.rateLimiter.denyBucket('reactions');

            const limited = await fixture.app().request(PATH, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ emoji: '❤️' })
            });

            assert.equal(limited.status, 429);
            assert.deepEqual(fixture.applyCalls, []);
        });

        test('stay hidden when public read is disabled', async () => {
            const fixture = new ReactionFixture();
            fixture.publicReadEnabled = false;

            const response = await fixture.app().request(PATH);

            assert.equal(response.status, 404);
        });
    });
}

// fudaba-card-review-handlers.test.ts
{
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
            origin: 'exchange',
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

    test.describe('Fudaba card review handlers', () => {
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

        // The claimed row keeps `origin='legacy'`, so the public namecard wall still
        // publishes it and addresses its media by reversing the stored object key. A
        // Fudaba-layout key (`community/fudaba/cards/...`) has no public form, so that
        // reversal threw and returned an opaque `查询失败` for the entire wall.
        test('claimed media lands where the public namecard wall can read it', async () => {
            const claim = adminClaim();
            const destinations: string[] = [];
            const published: string[] = [];
            const repository: Partial<FudabaRepository> = {
                async findAdminCardClaim() { return claim; },
                async beginCardClaimReview() {
                    return { status: 'claimed', claim: claimRecord() };
                },
                async completeCardClaimReview() {
                    return {
                        status: 'saved',
                        claim: { ...claimRecord(), state: 'approved' as const, revision: 2 },
                        card: null
                    };
                },
                async rollbackCardClaimReview() {
                    throw new Error('successful claim must not roll back');
                }
            };
            const objectStorage = storage({
                async get(key) { return stored(key.includes('front') ? 1 : 2); },
                async put(key, body) {
                    destinations.push(key);
                    return stored(body[0] ?? 0);
                },
                async publish(key) { published.push(key); }
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
            assert.deepEqual(destinations, [
                'community/namecards/assets/legacy-42-front/image.webp',
                'community/namecards/assets/legacy-42-back/image.webp'
            ]);
            assert.deepEqual(published, destinations);
            for (const key of destinations) {
                assert.match(
                    namecardOriginalUrlFromObjectKey(key),
                    /^\/uploads\/namecard\/original\//
                );
            }
            assert.notEqual(destinations[0], claim.legacy_image1_url);
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
            assert.deepEqual(await contractJson(response, reviewMutationSchema),
                { success: true, revision: 2 });
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
            assert.deepEqual(await contractJson(response, reviewMutationSchema),
                { success: true, revision: 2 });
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
    });
}

// fudaba-claim-review-repository.test.ts
{
    const CREATED_AT = '2026-08-16T19:30:00.000Z';
    const REVIEWED_AT = '2026-08-16T20:00:00.000Z';
    const PROFILE_AT = 1_776_000_000_000;

    function account(id: string): NewPlatformAccountInput {
        return {
            id,
            status: 'active',
            tokenVersion: 0,
            createdAt: PROFILE_AT,
            updatedAt: PROFILE_AT,
            deletedAt: null,
            profile: {
                displayName: `Producer ${id}`,
                avatarObjectKey: null,
                avatarExternalUrl: null,
                homeCity: null,
                bio: '',
                updatedAt: PROFILE_AT
            }
        };
    }

    function registeredCard(
        id: string,
        ownerAccountId: string,
        publicationStatus: NewFudabaCardInput['publicationStatus'] = 'published'
    ): NewFudabaCardInput {
        return {
            id,
            ownerAccountId,
            producerName: `Producer ${ownerAccountId}`,
            displayName: `Card ${id}`,
            seriesCode: '765',
            favoriteIdol: 'ignored compatibility input',
            favoriteIdolIds: [900_001],
            frontObjectKey: `community/fudaba/cards/${id}/front.webp`,
            backObjectKey: `community/fudaba/cards/${id}/back.webp`,
            accent: '#4f64dd',
            bio: '',
            tradeNote: '',
            available: true,
            sourceUrl: null,
            sourceLabel: null,
            sourceCredit: null,
            mediaRightsStatus: publicationStatus === 'published' ? 'approved' : 'unknown',
            publicationStatus,
            revision: 0,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
            deletedAt: null
        };
    }

    function ownerCard(id: string, ownerAccountId: string): CreateOwnedFudabaCardInput {
        const card = registeredCard(id, ownerAccountId, 'pending');
        return {
            id: card.id,
            ownerAccountId: card.ownerAccountId,
            producerName: card.producerName,
            displayName: card.displayName,
            seriesCode: card.seriesCode,
            favoriteIdol: card.favoriteIdol,
            favoriteIdolIds: card.favoriteIdolIds,
            frontObjectKey: card.frontObjectKey,
            backObjectKey: card.backObjectKey,
            accent: card.accent,
            bio: card.bio,
            tradeNote: card.tradeNote,
            available: card.available,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt
        };
    }

    const audit: AuditLogInput = {
        username: 'reviewer',
        producername: 'Review Admin',
        action: 'review namecard claim',
        target: 'namecard',
        ip: '127.0.0.1',
        time: REVIEWED_AT
    };

    async function insertLegacyCard(
        database: ManagedSqlDatabase,
        suffix: string
    ): Promise<number> {
        // A legacy id also becomes a fudaba_cards.card_number below. Exchange
        // cards created earlier in the same test draw card_number from
        // namecard_number_seq independently of cards_id_seq, so without this the
        // two counters can hand out the same number from opposite directions.
        // The real migration keeps them disjoint the same way (advance whichever
        // sequence is behind); mirror that here instead of relying on call order.
        await database.prepare(
            `SELECT setval(
            'public.cards_id_seq',
            GREATEST(
                (SELECT COALESCE(max(card_number), 0) FROM public.fudaba_cards),
                (SELECT last_value FROM public.cards_id_seq)
            )
        )`
        ).run();
        const row = await database.prepare(
            `INSERT INTO cards
            (image1_url, image2_url, hash1, hash2, ip, status,
             withdrawal_token_hash, series_code, submission_kind, revision)
         VALUES (?, ?, ?, ?, '127.0.0.1', 'approved', ?, NULL, 'legacy', 0)
         RETURNING id`
        ).bind(
            `legacy/${suffix}/front.webp`,
            `legacy/${suffix}/back.webp`,
            `legacy-${suffix}-front`,
            `legacy-${suffix}-back`,
            suffix.repeat(64).slice(0, 64)
        ).first<{ id: number }>();
        if (!row) throw new Error('Legacy card fixture insert failed');
        // The unification backfill turns every legacy card into an ownerless
        // fudaba_cards row keyed by card_number; claim approval now binds onto
        // that row in place, so a fixture created after the migration already
        // ran has to mirror it by hand instead of relying on a fresh backfill.
        await database.prepare(
            `INSERT INTO fudaba_cards
            (id, card_number, origin, producer_name, display_name,
             series_code, favorite_idol, accent, bio, trade_note,
             front_object_key, back_object_key, available,
             media_rights_status, publication_status, revision,
             created_at, updated_at)
         VALUES (?, ?, 'legacy', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                 ?, ?, FALSE, 'approved', 'published', 0, ?, ?)`
        ).bind(
            `legacy-${row.id}`,
            row.id,
            `legacy/${suffix}/front.webp`,
            `legacy/${suffix}/back.webp`,
            CREATED_AT,
            CREATED_AT
        ).run();
        // Keep namecard_number_seq ahead of the explicit card_number just used,
        // the same way the real migration advances it past every legacy id, so a
        // later default-assigned exchange card_number cannot collide with it.
        await database.prepare(
            `SELECT setval(
            'public.namecard_number_seq',
            GREATEST(?, (SELECT last_value FROM public.namecard_number_seq))
        )`
        ).bind(row.id).run();
        return row.id;
    }

    async function insertBackofficeActor(
        database: ManagedSqlDatabase
    ): Promise<number> {
        const row = await database.prepare(
            `INSERT INTO backoffice_accounts
            (username, password, dept, producername, admin_role)
         VALUES ('claim-reviewer', 'hash', 'op', 'Review Admin', 'super_admin')
         RETURNING id`
        ).first<{ id: number }>();
        if (!row) throw new Error('Backoffice actor fixture insert failed');
        return row.id;
    }

    async function fixture() {
        const database = await createPostgresTestDatabase('fudaba-claim-review');
        const siblingDatabase = connectPostgresTestDatabase(database);
        // The namecard_legacy_tables_read_only migration locks cards down for
        // the application; this suite's fixtures simulate pre-existing legacy
        // data directly in cards, so they bypass that guard the same way real
        // legacy data predates it.
        await database.prepare('ALTER TABLE public.cards DISABLE TRIGGER ALL').run();
        await seedCanonicalFudabaAgencies(database);
        const schema = new PostgresqlSchemaStrategy();
        const platform = new SqlPlatformAccountRepository(database, schema);
        const fudaba = new SqlFudabaRepository(database, schema);
        const sibling = new SqlFudabaRepository(siblingDatabase, schema);
        await Promise.all([
            platform.initialize(),
            fudaba.initialize(),
            sibling.initialize()
        ]);
        return { database, platform, fudaba, sibling };
    }

    describe('Fudaba claim review repository', () => {
        postgresTest('PostgreSQL claim envelopes, claims, and registered reviews are atomic CAS workflows', async () => {
            const { database, platform, fudaba, sibling } = await fixture();
            const ownerA = 'claim-owner-a';
            const ownerB = 'claim-owner-b';
            const ownerC = 'claim-owner-c';
            await Promise.all([
                platform.createAccountWithProfile(account(ownerA)),
                platform.createAccountWithProfile(account(ownerB)),
                platform.createAccountWithProfile(account(ownerC))
            ]);
            const reviewedBy = await insertBackofficeActor(database);

            const legacyId = await insertLegacyCard(database, 'a');
            const matchingCardId = String(legacyId);
            await fudaba.createCard(registeredCard(matchingCardId, ownerA));
            await database.prepare(
                'UPDATE fudaba_cards SET producer_name=?, display_name=? WHERE id=?'
            ).bind('P Name A', 'Card title A', matchingCardId).run();
            await fudaba.createCard(registeredCard(`0${legacyId}`, ownerA));

            const createdEnvelopes = await fudaba.ensureSameIdLegacyCardEnvelopes({
                title: '发现同 ID 历史名片',
                body: '请确认这是否是你的历史名片。',
                createdAt: CREATED_AT
            });
            assert.equal(createdEnvelopes.length, 1);
            assert.equal(createdEnvelopes[0].recipient_account_id, ownerA);
            assert.equal(createdEnvelopes[0].legacy_card_id, legacyId);
            assert.deepEqual(await fudaba.ensureSameIdLegacyCardEnvelopes({
                title: '发现同 ID 历史名片',
                body: '请确认这是否是你的历史名片。',
                createdAt: CREATED_AT
            }), []);

            const envelope = createdEnvelopes[0];
            const claimId = 'same-id-claim';
            assert.deepEqual(await fudaba.confirmLegacyCardEnvelope({
                envelopeId: envelope.id,
                recipientAccountId: ownerB,
                expectedRevision: 0,
                id: 'wrong-recipient-claim',
                targetCardId: matchingCardId,
                seriesCode: '765',
                idolIds: [900_001],
                message: '',
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT,
                actionedAt: CREATED_AT
            }), { status: 'unavailable' });

            const confirmed = await fudaba.confirmLegacyCardEnvelope({
                envelopeId: envelope.id,
                recipientAccountId: ownerA,
                expectedRevision: 0,
                id: claimId,
                targetCardId: matchingCardId,
                seriesCode: 'cg',
                idolIds: [900_001, 900_002],
                message: '这是我的旧名片',
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT,
                actionedAt: CREATED_AT
            });
            assert.equal(confirmed.status, 'created');
            if (confirmed.status !== 'created') return;
            assert.equal(confirmed.envelope.action_state, 'confirmed');
            assert.equal(confirmed.envelope.claim_id, claimId);
            assert.deepEqual(
                confirmed.claim.favorite_idols.map((idol) => idol.idol_id),
                [900_001, 900_002]
            );
            assert.deepEqual(await fudaba.listLegacyNamecardClaimStatuses(
                [legacyId],
                ownerA
            ), [{
                legacy_card_id: legacyId,
                claim_status: 'pending',
                viewer_claim_state: 'pending',
                claimer_name: null
            }]);
            const adminClaim = await fudaba.findAdminCardClaim(claimId);
            assert.equal(adminClaim?.claimant_display_name, 'Producer claim-owner-a');
            assert.equal(adminClaim?.legacy_image1_url, 'legacy/a/front.webp');
            assert.deepEqual(await fudaba.confirmLegacyCardEnvelope({
                envelopeId: envelope.id,
                recipientAccountId: ownerA,
                expectedRevision: 0,
                id: claimId,
                targetCardId: matchingCardId,
                seriesCode: 'cg',
                idolIds: [900_001, 900_002],
                message: '重放',
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT,
                actionedAt: CREATED_AT
            }), { status: 'conflict', revision: 1 });

            const blockedSecondClaim = await fudaba.createCardClaimForOwner({
                id: 'blocked-second-claim',
                legacyCardId: legacyId,
                claimantAccountId: ownerB,
                targetCardId: null,
                seriesCode: '765',
                idolIds: [900_001],
                message: '',
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT
            });
            assert.equal(blockedSecondClaim.status, 'conflict');

            const beginResults = await Promise.all([
                fudaba.beginCardClaimReview(claimId, 0),
                sibling.beginCardClaimReview(claimId, 0)
            ]);
            assert.deepEqual(
                beginResults.map((result) => result.status).sort(),
                ['claimed', 'conflict']
            );
            const claimCompleted = await fudaba.completeCardClaimReview({
                claimId,
                approvingRevision: 1,
                decision: 'approve',
                target: { kind: 'existing', cardId: matchingCardId },
                reviewedBy,
                reviewedAt: REVIEWED_AT,
                reviewNote: '身份信息一致',
                notificationTitle: '名片认领已通过',
                notificationBody: '历史名片已经绑定。',
                audit
            });
            assert.equal(claimCompleted.status, 'saved');
            if (claimCompleted.status !== 'saved') return;
            assert.equal(claimCompleted.claim.state, 'approved');
            assert.equal(claimCompleted.card?.legacy_card_id, legacyId);
            assert.equal((await fudaba.findCardById(matchingCardId))?.legacy_card_id, legacyId);
            // The ownerless legacy row this claim bound onto must stop showing up
            // twice: it stays in place (guest attributes/reactions history are not
            // lost) but gets soft deleted so it drops off every compat read path.
            const hiddenLegacyRow = await fudaba.findCardById(`legacy-${legacyId}`);
            assert.equal(hiddenLegacyRow?.owner_account_id, null);
            assert.notEqual(hiddenLegacyRow?.deleted_at, null);
            assert.deepEqual(await fudaba.listLegacyNamecardClaimStatuses(
                [legacyId],
                ownerA
            ), [{
                legacy_card_id: legacyId,
                claim_status: 'claimed',
                viewer_claim_state: 'approved',
                claimer_name: 'P Name A'
            }]);
            const ownerAEnvelopes = await fudaba.listClaimEnvelopesForOwner(ownerA, 20);
            const approvedEnvelope = ownerAEnvelopes.find(
                (item) => item.kind === 'claim-approved'
            );
            assert.ok(approvedEnvelope);
            const readEnvelope = await fudaba.markClaimEnvelopeRead({
                envelopeId: approvedEnvelope.id,
                recipientAccountId: ownerA,
                expectedRevision: 0,
                readAt: REVIEWED_AT
            });
            assert.equal(readEnvelope.status, 'saved');
            if (readEnvelope.status !== 'saved') return;
            assert.equal(readEnvelope.envelope.read_at, REVIEWED_AT);
            assert.deepEqual(await fudaba.markClaimEnvelopeRead({
                envelopeId: approvedEnvelope.id,
                recipientAccountId: ownerA,
                expectedRevision: 0,
                readAt: REVIEWED_AT
            }), { status: 'conflict', revision: 1 });
            const replay = await fudaba.completeCardClaimReview({
                claimId,
                approvingRevision: 1,
                decision: 'approve',
                target: { kind: 'existing', cardId: matchingCardId },
                reviewedBy,
                reviewedAt: REVIEWED_AT,
                reviewNote: '重放',
                notificationTitle: '名片认领已通过',
                notificationBody: '历史名片已经绑定。',
                audit
            });
            assert.equal(replay.status, 'conflict');
            await assert.rejects(
                database.prepare(
                    'UPDATE fudaba_cards SET legacy_card_id=? WHERE id=?'
                ).bind(legacyId, `0${legacyId}`).run(),
                /fudaba_cards_legacy_card_id_key/
            );

            const raceLegacyId = await insertLegacyCard(database, 'r');
            const raceResults = await Promise.all([
                fudaba.createCardClaimForOwner({
                    id: 'race-claim-a',
                    legacyCardId: raceLegacyId,
                    claimantAccountId: ownerA,
                    targetCardId: null,
                    seriesCode: '765',
                    idolIds: [900_001],
                    message: '',
                    createdAt: CREATED_AT,
                    updatedAt: CREATED_AT
                }),
                sibling.createCardClaimForOwner({
                    id: 'race-claim-b',
                    legacyCardId: raceLegacyId,
                    claimantAccountId: ownerB,
                    targetCardId: null,
                    seriesCode: 'cg',
                    idolIds: [900_002],
                    message: '',
                    createdAt: CREATED_AT,
                    updatedAt: CREATED_AT
                })
            ]);
            assert.deepEqual(
                raceResults.map((result) => result.status).sort(),
                ['conflict', 'created']
            );

            for (const [suffix, idolIds] of [
                ['e', []],
                ['d', [900_001, 900_001]],
                ['m', [999_999]],
                ['x', Array.from({ length: 21 }, (_, index) => 910_000 + index)]
            ] as const) {
                const invalidLegacyId = await insertLegacyCard(database, suffix);
                assert.deepEqual(await fudaba.createCardClaimForOwner({
                    id: `invalid-claim-${suffix}`,
                    legacyCardId: invalidLegacyId,
                    claimantAccountId: ownerA,
                    targetCardId: null,
                    seriesCode: '765',
                    idolIds: [...idolIds],
                    message: '',
                    createdAt: CREATED_AT,
                    updatedAt: CREATED_AT
                }), { status: 'unavailable' });
            }

            const wrongOwnerLegacyId = await insertLegacyCard(database, 'w');
            assert.deepEqual(await fudaba.createCardClaimForOwner({
                id: 'wrong-owner-target',
                legacyCardId: wrongOwnerLegacyId,
                claimantAccountId: ownerB,
                targetCardId: matchingCardId,
                seriesCode: '765',
                idolIds: [900_001],
                message: '',
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT
            }), { status: 'unavailable' });

            const createLegacyId = await insertLegacyCard(database, 'c');
            const createClaim = await fudaba.createCardClaimForOwner({
                id: 'create-card-claim',
                legacyCardId: createLegacyId,
                claimantAccountId: ownerB,
                targetCardId: null,
                seriesCode: 'cg',
                idolIds: [900_001, 900_002],
                message: '请创建绑定后的名片',
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT
            });
            assert.equal(createClaim.status, 'created');
            const createBegin = await fudaba.beginCardClaimReview('create-card-claim', 0);
            assert.equal(createBegin.status, 'claimed');
            // The legacy card is already the ownerless row 'legacy-<id>' the
            // unification backfill created, so the approve target binds onto that
            // same id in place instead of minting an unrelated new row.
            const boundCreateCardId = `legacy-${createLegacyId}`;
            const createdCardResult = await fudaba.completeCardClaimReview({
                claimId: 'create-card-claim',
                approvingRevision: 1,
                decision: 'approve',
                target: {
                    kind: 'create',
                    card: {
                        id: boundCreateCardId,
                        producerName: 'Claimed Producer',
                        displayName: 'Claimed Card',
                        frontObjectKey: `community/fudaba/cards/${boundCreateCardId}/front.webp`,
                        backObjectKey: `community/fudaba/cards/${boundCreateCardId}/back.webp`,
                        accent: '#4f64dd',
                        bio: '',
                        tradeNote: '',
                        available: true
                    }
                },
                reviewedBy,
                reviewedAt: REVIEWED_AT,
                reviewNote: '已核验原图',
                notificationTitle: '名片认领已通过',
                notificationBody: '已创建可管理的注册名片。',
                audit
            });
            assert.equal(createdCardResult.status, 'saved');
            if (createdCardResult.status !== 'saved') return;
            assert.equal(createdCardResult.card?.id, boundCreateCardId);
            assert.equal(createdCardResult.card?.legacy_card_id, createLegacyId);
            // origin/card_number are not part of FudabaCardRecord, so confirm the
            // in-place upgrade directly: the row keeps its original identity and
            // provenance instead of a second row appearing beside it.
            const boundCreateCardRow = await database.prepare(
                `SELECT origin, card_number FROM fudaba_cards WHERE id=?`
            ).bind(boundCreateCardId).first<{ origin: string; card_number: number }>();
            assert.equal(boundCreateCardRow?.origin, 'legacy');
            assert.equal(boundCreateCardRow?.card_number, createLegacyId);
            assert.equal(createdCardResult.card?.owner_account_id, ownerB);
            assert.equal(createdCardResult.card?.series_code, 'cg');
            assert.equal(createdCardResult.card?.publication_status, 'published');
            assert.equal(createdCardResult.card?.media_rights_status, 'approved');
            assert.equal(createdCardResult.card?.favorite_idol, '测试春香、测试卯月');
            assert.equal(
                createdCardResult.card?.front_object_key,
                `community/fudaba/cards/${boundCreateCardId}/front.webp`
            );
            assert.equal((await fudaba.softDeleteCardForOwner({
                cardId: boundCreateCardId,
                ownerAccountId: ownerB,
                expectedRevision: 1,
                deletedAt: REVIEWED_AT
            })).status, 'saved');
            assert.equal(
                (await fudaba.listLegacyNamecardClaimStatuses(
                    [createLegacyId],
                    ownerB
                ))[0]?.claim_status,
                'claimed'
            );

            const rejectedLegacyId = await insertLegacyCard(database, 'j');
            const rejectedClaim = await fudaba.createCardClaimForOwner({
                id: 'rejected-claim',
                legacyCardId: rejectedLegacyId,
                claimantAccountId: ownerC,
                targetCardId: null,
                seriesCode: '765',
                idolIds: [900_001],
                message: '',
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT
            });
            assert.equal(rejectedClaim.status, 'created');
            assert.equal(
                (await fudaba.beginCardClaimReview('rejected-claim', 0)).status,
                'claimed'
            );
            const rejected = await fudaba.completeCardClaimReview({
                claimId: 'rejected-claim',
                approvingRevision: 1,
                decision: 'reject',
                reviewedBy,
                reviewedAt: REVIEWED_AT,
                reviewNote: '证据不足',
                notificationTitle: '名片认领未通过',
                notificationBody: '请补充证明后重新提交。',
                audit: { ...audit, action: 'reject namecard claim' }
            });
            assert.equal(rejected.status, 'saved');
            if (rejected.status !== 'saved') return;
            assert.equal(rejected.claim.state, 'rejected');
            assert.equal(rejected.card, null);
            assert.equal(
                (await fudaba.listClaimEnvelopesForOwner(ownerC, 20))
                    .filter((item) => item.kind === 'claim-rejected').length,
                1
            );

            const declinedLegacyId = await insertLegacyCard(database, 'n');
            await fudaba.createCard(registeredCard(String(declinedLegacyId), ownerB));
            const [declineEnvelope] = await fudaba.ensureSameIdLegacyCardEnvelopes({
                title: '发现同 ID 历史名片',
                body: '请确认这是否是你的历史名片。',
                createdAt: CREATED_AT
            });
            assert.equal(declineEnvelope.legacy_card_id, declinedLegacyId);
            assert.deepEqual(await fudaba.actionClaimEnvelope({
                envelopeId: declineEnvelope.id,
                recipientAccountId: ownerA,
                action: 'decline',
                expectedRevision: 0,
                actionedAt: REVIEWED_AT
            }), { status: 'unavailable' });
            const declined = await fudaba.actionClaimEnvelope({
                envelopeId: declineEnvelope.id,
                recipientAccountId: ownerB,
                action: 'decline',
                expectedRevision: 0,
                actionedAt: REVIEWED_AT
            });
            assert.equal(declined.status, 'saved');
            assert.deepEqual(await fudaba.actionClaimEnvelope({
                envelopeId: declineEnvelope.id,
                recipientAccountId: ownerB,
                action: 'decline',
                expectedRevision: 0,
                actionedAt: REVIEWED_AT
            }), { status: 'conflict', revision: 1 });

            const reviewCardId = 'registered-review-card';
            const reviewCreated = await fudaba.createCardForOwner(ownerCard(reviewCardId, ownerC));
            assert.equal(reviewCreated.status, 'saved');
            const registeredBegin = await Promise.all([
                fudaba.beginRegisteredCardReview(reviewCardId, 0),
                sibling.beginRegisteredCardReview(reviewCardId, 0)
            ]);
            assert.deepEqual(
                registeredBegin.map((result) => result.status).sort(),
                ['claimed', 'conflict']
            );
            assert.deepEqual(await fudaba.updateCardMetadataForOwner({
                cardId: reviewCardId,
                ownerAccountId: ownerC,
                producerName: 'Blocked while reviewing',
                displayName: 'Blocked',
                seriesCode: '765',
                favoriteIdol: '',
                favoriteIdolIds: [900_001],
                accent: '#4f64dd',
                bio: '',
                tradeNote: '',
                available: true,
                expectedRevision: 1,
                updatedAt: REVIEWED_AT
            }), { status: 'unavailable' });
            const registeredComplete = await fudaba.completeRegisteredCardReview({
                cardId: reviewCardId,
                approvingRevision: 1,
                decision: 'publish',
                reviewedAt: REVIEWED_AT,
                audit: { ...audit, action: 'publish registered card' }
            });
            assert.equal(registeredComplete.status, 'saved');
            if (registeredComplete.status !== 'saved') return;
            assert.equal(registeredComplete.card.publication_status, 'published');
            assert.equal(registeredComplete.card.media_rights_status, 'approved');
            const registeredReplay = await fudaba.completeRegisteredCardReview({
                cardId: reviewCardId,
                approvingRevision: 1,
                decision: 'publish',
                reviewedAt: REVIEWED_AT,
                audit: { ...audit, action: 'publish registered card' }
            });
            assert.equal(registeredReplay.status, 'conflict');

            const rejectedCardId = 'registered-rejected-card';
            assert.equal(
                (await fudaba.createCardForOwner(ownerCard(rejectedCardId, ownerC))).status,
                'saved'
            );
            assert.equal(
                (await fudaba.beginRegisteredCardReview(rejectedCardId, 0)).status,
                'claimed'
            );
            const registeredRejected = await fudaba.completeRegisteredCardReview({
                cardId: rejectedCardId,
                approvingRevision: 1,
                decision: 'reject',
                reviewedAt: REVIEWED_AT,
                audit: { ...audit, action: 'reject registered card' }
            });
            assert.equal(registeredRejected.status, 'saved');
            if (registeredRejected.status !== 'saved') return;
            assert.equal(registeredRejected.card.publication_status, 'rejected');
            assert.equal(registeredRejected.card.media_rights_status, 'denied');

            const rollbackCardId = 'registered-review-rollback';
            assert.equal(
                (await fudaba.createCardForOwner(ownerCard(rollbackCardId, ownerC))).status,
                'saved'
            );
            assert.equal(
                (await fudaba.beginRegisteredCardReview(rollbackCardId, 0)).status,
                'claimed'
            );
            assert.equal(await fudaba.rollbackRegisteredCardReview(rollbackCardId, 1), true);
            const rolledBackCard = await fudaba.findRegisteredCardForAdmin(rollbackCardId);
            assert.equal(rolledBackCard?.publication_status, 'pending');
            assert.equal(rolledBackCard?.revision, 2);

            const rollbackLegacyId = await insertLegacyCard(database, 'q');
            assert.equal((await fudaba.createCardClaimForOwner({
                id: 'claim-review-rollback',
                legacyCardId: rollbackLegacyId,
                claimantAccountId: ownerC,
                targetCardId: null,
                seriesCode: '765',
                idolIds: [900_001],
                message: '',
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT
            })).status, 'created');
            assert.equal(
                (await fudaba.beginCardClaimReview('claim-review-rollback', 0)).status,
                'claimed'
            );
            assert.equal(await fudaba.rollbackCardClaimReview('claim-review-rollback', 1), true);
            const rolledBackClaim = await fudaba.findAdminCardClaim('claim-review-rollback');
            assert.equal(rolledBackClaim?.state, 'pending');
            assert.equal(rolledBackClaim?.revision, 2);
        });
    });
}

// fudaba-domain-repository.test.ts
{
    const CREATED_AT = '2026-08-02T00:00:00.000Z';
    const UPDATED_AT = '2026-08-02T00:01:00.000Z';
    const RESOLVED_AT = '2026-08-02T00:02:00.000Z';

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined
    };

    interface Fixture {
        database: ManagedSqlDatabase;
        repository: SqlFudabaRepository;
        dialect: 'postgresql';
    }

    function office(
        id: string,
        ownerAccountId: string,
        overrides: Partial<NewFudabaOfficeInput> = {}
    ): NewFudabaOfficeInput {
        return {
            id,
            ownerAccountId,
            slug: id,
            name: `Office ${id}`,
            intro: '',
            city: 'Shanghai',
            address: '765 Producer Street',
            latitude: 31.2304,
            longitude: 121.4737,
            accent: '#ef5b6c',
            coverObjectKey: null,
            isOpen: true,
            visitorCount: 0,
            status: 'active',
            revision: 0,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
            archivedAt: null,
            seriesCodes: ['765'],
            ...overrides
        };
    }

    function card(
        id: string,
        ownerAccountId: string,
        overrides: Partial<NewFudabaCardInput> = {}
    ): NewFudabaCardInput {
        return {
            id,
            ownerAccountId,
            producerName: `Producer ${ownerAccountId}`,
            displayName: `Card ${id}`,
            seriesCode: '765',
            favoriteIdol: '',
            favoriteIdolIds: [900_001],
            frontObjectKey: `community/fudaba/cards/${id}/front.webp`,
            backObjectKey: `community/fudaba/cards/${id}/back.webp`,
            accent: '#4f64dd',
            bio: '',
            tradeNote: '',
            available: true,
            sourceUrl: null,
            sourceLabel: null,
            sourceCredit: null,
            mediaRightsStatus: 'approved',
            publicationStatus: 'published',
            revision: 0,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
            deletedAt: null,
            ...overrides
        };
    }

    async function createFixture(
        dialect: 'postgresql' = 'postgresql'
    ): Promise<Fixture> {
        const harness = await createPostgresTestHarness();
        const repository = new SqlFudabaRepository(
            harness.connection,
            initializedPostgresSchema
        );
        onTestFinished(() => harness.close());
        await repository.initialize();
        await seedCanonicalFudabaAgencies(harness.connection);
        return { database: harness.connection, repository, dialect };
    }

    async function seedPlatformAccount(
        fixture: Fixture,
        accountId: string
    ): Promise<void> {
        await insertPlatformAccount(fixture.database, accountId);
    }

    async function seedBackofficeActor(
        fixture: Fixture,
        username: string
    ): Promise<number> {
        const actor = await insertBackofficeAccount(fixture.database, username, {
            producername: username
        });
        assert.ok(actor);
        return actor;
    }

    async function placeCard(
        fixture: Fixture,
        officeId: string,
        cardId: string,
        ownerAccountId: string,
        zIndex = 1
    ): Promise<boolean> {
        return fixture.repository.placeOwnedCard({
            officeId,
            cardId,
            ownerAccountId,
            pinnedAt: CREATED_AT,
            positionX: 50,
            positionY: 50,
            rotation: 0,
            zIndex
        });
    }

    describe('Fudaba domain repository', () => {
        postgresTest('office creation and series assignment are atomic', async () => {
            const fixture = await createFixture();
            await seedPlatformAccount(fixture, 'office-owner');

            await assert.rejects(fixture.repository.createOffice(office(
                'rolled-back-office',
                'office-owner',
                { seriesCodes: ['765', 'not-a-series'] }
            )));
            assert.equal(await fixture.repository.findOfficeById('rolled-back-office'), null);
            assert.equal(await fixture.database.prepare(
                'SELECT COUNT(*) AS count FROM fudaba_office_series_tags WHERE office_id=?'
            ).bind('rolled-back-office').first<number>('count'), 0);

            const created = await fixture.repository.createOffice(office(
                'atomic-office',
                'office-owner',
                { slug: '上海-事务所', seriesCodes: ['765', 'cg'] }
            ));
            assert.equal(created.owner_account_id, 'office-owner');
            assert.equal(created.slug, '上海-事务所');
            await fixture.database.prepare(
                `INSERT INTO fudaba_office_series_tags
            (office_id, series_code, display_order)
         VALUES (?, 'ml', 1)`
            ).bind(created.id).run();
            const assigned = await fixture.database.prepare(
                `SELECT series_code, display_order FROM fudaba_office_series_tags
         WHERE office_id=? ORDER BY display_order, series_code`
            ).bind(created.id).all<{ series_code: string; display_order: number }>();
            assert.deepEqual(assigned.results, [
                { series_code: '765', display_order: 0 },
                { series_code: 'cg', display_order: 1 },
                { series_code: 'ml', display_order: 1 }
            ]);
        });

        async function assertOwnerAndArchiveBoundary(
            dialect: 'postgresql'
        ): Promise<void> {
            const fixture = await createFixture(dialect);
            for (const accountId of ['owner', 'intruder', 'requester']) {
                await seedPlatformAccount(fixture, `${dialect}-${accountId}`);
            }
            const ownerId = `${dialect}-owner`;
            const intruderId = `${dialect}-intruder`;
            const requesterId = `${dialect}-requester`;
            const officeId = `${dialect}-archive-office`;
            const wantedId = `${dialect}-wanted-card`;
            const blockedId = `${dialect}-blocked-card`;
            await fixture.repository.createOffice(office(officeId, ownerId, {
                slug: `上海-${dialect}`
            }));
            await fixture.repository.createCard(card(wantedId, ownerId));
            await fixture.repository.createCard(card(blockedId, ownerId));

            assert.equal(await placeCard(fixture, officeId, wantedId, intruderId), false);
            assert.equal(await fixture.database.prepare(
                'SELECT COUNT(*) AS count FROM fudaba_office_cards WHERE office_id=?'
            ).bind(officeId).first<number>('count'), 0);
            assert.equal(await placeCard(fixture, officeId, wantedId, ownerId), true);

            assert.equal(await fixture.repository.updateOfficeStatusForOwner({
                officeId,
                ownerAccountId: intruderId,
                status: 'archived',
                archivedAt: UPDATED_AT,
                updatedAt: UPDATED_AT,
                expectedRevision: 0
            }), false);
            assert.equal(await fixture.repository.updateOfficeStatusForOwner({
                officeId,
                ownerAccountId: ownerId,
                status: 'archived',
                archivedAt: UPDATED_AT,
                updatedAt: UPDATED_AT,
                expectedRevision: 0
            }), true);
            assert.equal(await placeCard(fixture, officeId, blockedId, ownerId, 2), false);
            assert.equal(await fixture.repository.createMessage({
                id: `${dialect}-blocked-message`,
                officeId,
                authorAccountId: requesterId,
                content: 'This must not be persisted.',
                createdAt: UPDATED_AT
            }), false);
            assert.equal(await fixture.repository.createExchangeRequest({
                id: `${dialect}-blocked-exchange`,
                officeId,
                requesterAccountId: requesterId,
                recipientAccountId: ownerId,
                wantedCardId: wantedId,
                offeredCardId: null,
                note: '',
                createdAt: UPDATED_AT
            }), null);

            await assert.rejects(fixture.database.prepare(
                `INSERT INTO fudaba_office_cards
            (office_id, card_id, pinned_at, position_x, position_y, rotation, z_index)
         VALUES (?, ?, ?, 50, 50, 0, 3)`
            ).bind(officeId, blockedId, UPDATED_AT).run());
            await assert.rejects(fixture.database.prepare(
                `INSERT INTO fudaba_messages
            (id, office_id, author_account_id, content, created_at)
         VALUES (?, ?, ?, 'Bypassed repository', ?)`
            ).bind(`${dialect}-direct-message`, officeId, requesterId, UPDATED_AT).run());
            await assert.rejects(fixture.database.prepare(
                `INSERT INTO fudaba_exchange_requests
            (id, office_id, requester_account_id, recipient_account_id,
             wanted_card_id, offered_card_id, note, status, version,
             created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL, '', 'pending', 0, ?, ?, NULL)`
            ).bind(
                `${dialect}-direct-exchange`,
                officeId,
                requesterId,
                ownerId,
                wantedId,
                UPDATED_AT,
                UPDATED_AT
            ).run());
        }

        async function assertExchangeConstraints(
            dialect: 'postgresql'
        ): Promise<void> {
            const fixture = await createFixture(dialect);
            const requesterId = `${dialect}-exchange-requester`;
            const recipientId = `${dialect}-exchange-recipient`;
            const otherId = `${dialect}-exchange-other`;
            const officeId = `${dialect}-exchange-office`;
            const wantedCardId = `${dialect}-wanted-card`;
            const offeredCardId = `${dialect}-offered-card`;
            const otherCardId = `${dialect}-other-card`;
            const exchangeId = `${dialect}-valid-exchange`;
            for (const accountId of [requesterId, recipientId, otherId]) {
                await seedPlatformAccount(fixture, accountId);
            }
            await fixture.repository.createOffice(office(officeId, recipientId));
            await fixture.repository.createCard(card(wantedCardId, recipientId));
            await fixture.repository.createCard(card(offeredCardId, requesterId));
            await fixture.repository.createCard(card(otherCardId, otherId));
            assert.equal(await placeCard(
                fixture,
                officeId,
                wantedCardId,
                recipientId
            ), true);

            assert.equal(await fixture.repository.createExchangeRequest({
                id: `${dialect}-wrong-wanted-owner`,
                officeId,
                requesterAccountId: requesterId,
                recipientAccountId: otherId,
                wantedCardId,
                offeredCardId,
                note: '',
                createdAt: CREATED_AT
            }), null);
            assert.equal(await fixture.repository.createExchangeRequest({
                id: `${dialect}-wrong-offered-owner`,
                officeId,
                requesterAccountId: requesterId,
                recipientAccountId: recipientId,
                wantedCardId,
                offeredCardId: otherCardId,
                note: '',
                createdAt: CREATED_AT
            }), null);
            await assert.rejects(fixture.database.prepare(
                `INSERT INTO fudaba_exchange_requests
            (id, office_id, requester_account_id, recipient_account_id,
             wanted_card_id, offered_card_id, note, status, version,
             created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL, '', 'pending', 0, ?, ?, NULL)`
            ).bind(
                `${dialect}-direct-wrong-wanted-owner`,
                officeId,
                requesterId,
                otherId,
                wantedCardId,
                CREATED_AT,
                CREATED_AT
            ).run());
            await assert.rejects(fixture.database.prepare(
                `INSERT INTO fudaba_exchange_requests
            (id, office_id, requester_account_id, recipient_account_id,
             wanted_card_id, offered_card_id, note, status, version,
             created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, '', 'pending', 0, ?, ?, NULL)`
            ).bind(
                `${dialect}-direct-wrong-offered-owner`,
                officeId,
                requesterId,
                recipientId,
                wantedCardId,
                otherCardId,
                CREATED_AT,
                CREATED_AT
            ).run());

            const created = await fixture.repository.createExchangeRequest({
                id: exchangeId,
                officeId,
                requesterAccountId: requesterId,
                recipientAccountId: recipientId,
                wantedCardId,
                offeredCardId,
                note: 'Trade?',
                createdAt: CREATED_AT
            });
            assert.equal(created?.status, 'pending');
            assert.equal(created?.created_at, CREATED_AT);
            assert.equal(created?.offered_card_id, offeredCardId);
            assert.equal(await fixture.repository.createExchangeRequest({
                id: `${dialect}-duplicate-pending-exchange`,
                officeId,
                requesterAccountId: requesterId,
                recipientAccountId: recipientId,
                wantedCardId,
                offeredCardId: null,
                note: '',
                createdAt: UPDATED_AT
            }), null);

            await fixture.database.prepare(
                `UPDATE fudaba_exchange_requests
         SET status='accepted', version=1, updated_at=?, resolved_at=?
         WHERE id=?`
            ).bind(UPDATED_AT, UPDATED_AT, exchangeId).run();
            await assert.rejects(fixture.database.prepare(
                `UPDATE fudaba_exchange_requests
         SET status='declined', version=2, updated_at=?, resolved_at=?
         WHERE id=?`
            ).bind(RESOLVED_AT, RESOLVED_AT, exchangeId).run());
            assert.equal(await fixture.database.prepare(
                'SELECT status FROM fudaba_exchange_requests WHERE id=?'
            ).bind(exchangeId).first<string>('status'), 'accepted');
        }

        postgresTest('media rights and moderation constraints cannot be bypassed', async () => {
            const fixture = await createFixture();
            await seedPlatformAccount(fixture, 'card-owner');
            const actorId = await seedBackofficeActor(fixture, 'fudaba-moderator');

            await assert.rejects(fixture.repository.createCard(card(
                'unapproved-published-card',
                'card-owner',
                { mediaRightsStatus: 'unknown', publicationStatus: 'published' }
            )));
            const published = await fixture.repository.createCard(card(
                'approved-published-card',
                'card-owner'
            ));
            assert.equal(published.media_rights_status, 'approved');
            assert.equal(published.publication_status, 'published');

            await assert.rejects(fixture.repository.createModerationCase({
                id: 'resolved-without-actor',
                resourceKind: 'card',
                resourceId: published.id,
                reporterAccountId: 'card-owner',
                reason: 'Rights review',
                details: '',
                state: 'resolved',
                backofficeActorId: null,
                resolution: 'Approved',
                createdAt: CREATED_AT,
                updatedAt: UPDATED_AT,
                resolvedAt: UPDATED_AT
            }));
            const resolved = await fixture.repository.createModerationCase({
                id: 'resolved-with-actor',
                resourceKind: 'card',
                resourceId: published.id,
                reporterAccountId: 'card-owner',
                reason: 'Rights review',
                details: '',
                state: 'resolved',
                backofficeActorId: actorId,
                resolution: 'Approved',
                createdAt: CREATED_AT,
                updatedAt: UPDATED_AT,
                resolvedAt: UPDATED_AT
            });
            assert.equal(resolved.backoffice_actor_id, actorId);
            await assert.rejects(fixture.repository.createModerationCase({
                id: 'resolved-with-missing-actor',
                resourceKind: 'card',
                resourceId: published.id,
                reporterAccountId: null,
                reason: 'Rights review',
                details: '',
                state: 'resolved',
                backofficeActorId: actorId + 10_000,
                resolution: 'Approved',
                createdAt: CREATED_AT,
                updatedAt: UPDATED_AT,
                resolvedAt: UPDATED_AT
            }));
        });

        async function assertModerationActorRetention(
            dialect: 'postgresql'
        ): Promise<void> {
            const fixture = await createFixture(dialect);
            const actorId = await seedBackofficeActor(
                fixture,
                `${dialect}-retained-moderator`
            );
            await fixture.repository.createModerationCase({
                id: `${dialect}-retained-moderation-case`,
                resourceKind: 'office',
                resourceId: `${dialect}-office`,
                reporterAccountId: null,
                reason: 'Policy review',
                details: '',
                state: 'resolved',
                backofficeActorId: actorId,
                resolution: 'Retain actor identity',
                createdAt: CREATED_AT,
                updatedAt: UPDATED_AT,
                resolvedAt: UPDATED_AT
            });
            const adminAccounts = new SqlAdminAccountRepository(fixture.database);

            assert.equal(
                await adminAccounts.deleteAdminAccount(actorId),
                'moderation-history'
            );
            assert.equal(await fixture.database.prepare(
                'SELECT COUNT(*) AS count FROM backoffice_accounts WHERE id=?'
            ).bind(actorId).first<number>('count'), 1);
            assert.equal(await fixture.database.prepare(
                `SELECT backoffice_actor_id FROM fudaba_moderation_cases WHERE id=?`
            ).bind(`${dialect}-retained-moderation-case`).first<number>(
                'backoffice_actor_id'
            ), actorId);
        }

        postgresTest('real PostgreSQL enforces Fudaba ownership and archived-office constraints', async () => {
            await assertOwnerAndArchiveBoundary('postgresql');
        });

        postgresTest('real PostgreSQL enforces exchange ownership and final-state constraints', async () => {
            await assertExchangeConstraints('postgresql');
        });

        postgresTest('real PostgreSQL retains actors referenced by resolved moderation cases', async () => {
            await assertModerationActorRetention('postgresql');
        });
    });
}

// fudaba-location-repository.test.ts
{
    const SUBMITTED_AT = "2026-08-03T01:00:00.000Z";
    const RESUBMITTED_AT = "2026-08-03T02:00:00.000Z";
    const REVIEWED_AT = "2026-08-03T03:00:00.000Z";
    const PUBLISH_OPERATION_ID = "00000000-0000-4000-8000-000000000001";
    const STALE_OPERATION_ID = "00000000-0000-4000-8000-000000000002";
    const FAILED_OPERATION_ID = "00000000-0000-4000-8000-000000000003";

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined,
    };

    interface Fixture {
        database: ManagedSqlDatabase;
        repository: SqlFudabaRepository;
        dialect: "postgresql";
    }

    async function createFixture(
        dialect: Fixture["dialect"],
    ): Promise<Fixture> {
        const harness = await createPostgresTestHarness();
        const repository = new SqlFudabaRepository(
            harness.connection,
            initializedPostgresSchema,
        );
        onTestFinished(() => harness.close());
        await repository.initialize();
        await seedCanonicalFudabaAgencies(harness.connection);
        return { database: harness.connection, repository, dialect };
    }

    async function seedAccount(
        fixture: Fixture,
        id: string,
        status: PlatformAccountStatus = "active",
    ): Promise<void> {
        await insertPlatformAccount(fixture.database, id, { status });
    }

    function office(
        id: string,
        ownerAccountId: string,
        overrides: Partial<NewFudabaOfficeInput> = {},
    ): NewFudabaOfficeInput {
        return {
            id,
            ownerAccountId,
            slug: id,
            name: `Office ${id}`,
            intro: "Private intro",
            city: "Shanghai",
            address: "Private exact address",
            latitude: 31.2304,
            longitude: 121.4737,
            accent: "#ef5b6c",
            coverObjectKey: null,
            isOpen: true,
            visitorCount: 0,
            status: "active",
            revision: 0,
            createdAt: SUBMITTED_AT,
            updatedAt: SUBMITTED_AT,
            archivedAt: null,
            seriesCodes: ["765"],
            ...overrides,
        };
    }

    async function seedReviewer(fixture: Fixture): Promise<number> {
        const row = await insertBackofficeAccount(
            fixture.database,
            `${fixture.dialect}-location-reviewer`,
            { producername: "Reviewer" },
        );
        assert.ok(row);
        return row;
    }

    async function insertReviewedLocation(
        fixture: Fixture,
        input: {
            officeId: string;
            latitudeE1: number;
            longitudeE1: number;
            reviewerId: number;
            state?: "published" | "rejected";
            note?: string;
        },
    ): Promise<void> {
        await insertFudabaOfficePublicLocation(
            fixture.database,
            input.officeId,
            SUBMITTED_AT,
            {
                latitude_e1: input.latitudeE1,
                longitude_e1: input.longitudeE1,
                review_state: input.state ?? "published",
                revision: 1,
                reviewed_at: REVIEWED_AT,
                reviewed_by: input.reviewerId,
                review_note: input.note ?? "",
                review_audit_id: crypto.randomUUID(),
            },
        );
    }

    function reviewAudit(target: string) {
        return {
            username: "location-reviewer",
            producername: "Reviewer",
            action: "发布 Fudaba 事务所公开位置",
            target,
            ip: "127.0.0.1",
            time: REVIEWED_AT,
        };
    }

    async function installFailingAuditTrigger(fixture: Fixture): Promise<void> {
        await fixture.database.executeScript(`
        CREATE FUNCTION fail_fudaba_location_audit()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'forced Fudaba location audit failure';
        END;
        $$;
        CREATE TRIGGER fail_fudaba_location_audit
        BEFORE INSERT ON logs
        FOR EACH ROW EXECUTE FUNCTION fail_fudaba_location_audit();
    `);
    }

    async function removeFailingAuditTrigger(fixture: Fixture): Promise<void> {
        await fixture.database.executeScript(`
        DROP TRIGGER fail_fudaba_location_audit ON logs;
        DROP FUNCTION fail_fudaba_location_audit();
    `);
    }

    async function assertLocationRepository(
        dialect: Fixture["dialect"],
    ): Promise<void> {
        const fixture = await createFixture(dialect);
        const ownerId = `${dialect}-location-owner`;
        const otherId = `${dialect}-location-other`;
        const restrictedId = `${dialect}-location-restricted`;
        const suspendedId = `${dialect}-location-suspended`;
        await seedAccount(fixture, ownerId);
        await seedAccount(fixture, otherId);
        await seedAccount(fixture, restrictedId, "restricted");
        await seedAccount(fixture, suspendedId, "suspended");
        const reviewerId = await seedReviewer(fixture);

        await fixture.repository.createOffice(office("location-main", ownerId));
        await fixture.repository.createOffice(
            office("location-hidden", ownerId, {
                status: "hidden",
            }),
        );
        await fixture.repository.createOffice(
            office("location-archived", ownerId, {
                status: "archived",
                archivedAt: RESUBMITTED_AT,
            }),
        );
        await insertFudabaOfficePublicLocation(
            fixture.database,
            "location-hidden",
            SUBMITTED_AT,
            { latitude_e1: 300, longitude_e1: 1200 },
        );

        const created = await fixture.repository.saveOfficePublicLocationForOwner({
            officeId: "location-main",
            ownerAccountId: ownerId,
            latitudeE1: 312,
            longitudeE1: 1215,
            expectedRevision: null,
            submittedAt: SUBMITTED_AT,
        });
        assert.equal(created.status, "saved");
        if (created.status !== "saved") return;
        assert.deepEqual(created.location, {
            office_id: "location-main",
            latitude_e1: 312,
            longitude_e1: 1215,
            review_state: "pending",
            revision: 0,
            submitted_at: SUBMITTED_AT,
            reviewed_at: null,
            reviewed_by: null,
            review_note: "",
        });
        assert.deepEqual(
            await fixture.repository.saveOfficePublicLocationForOwner({
                officeId: "location-main",
                ownerAccountId: otherId,
                latitudeE1: 300,
                longitudeE1: 1200,
                expectedRevision: 0,
                submittedAt: RESUBMITTED_AT,
            }),
            { status: "unavailable" },
        );
        for (const officeId of ["location-hidden", "location-archived"]) {
            assert.deepEqual(
                await fixture.repository.saveOfficePublicLocationForOwner({
                    officeId,
                    ownerAccountId: ownerId,
                    latitudeE1: 300,
                    longitudeE1: 1200,
                    expectedRevision: null,
                    submittedAt: RESUBMITTED_AT,
                }),
                { status: "unavailable" },
            );
        }

        const published = await fixture.repository.reviewOfficePublicLocation({
            officeId: "location-main",
            decision: "publish",
            expectedRevision: 0,
            reviewedAt: REVIEWED_AT,
            reviewedBy: reviewerId,
            reviewNote: "",
            reviewOperationId: PUBLISH_OPERATION_ID,
            audit: reviewAudit("location-main@1"),
        });
        assert.equal(published.status, "saved");
        assert.deepEqual(
            await fixture.database
                .prepare(
                    `SELECT username, producername, action, target, ip, time
         FROM logs WHERE target='location-main@1'`,
                )
                .first(),
            reviewAudit("location-main@1"),
        );
        assert.deepEqual(
            await fixture.repository.reviewOfficePublicLocation({
                officeId: "location-main",
                decision: "reject",
                expectedRevision: 0,
                reviewedAt: REVIEWED_AT,
                reviewedBy: reviewerId,
                reviewNote: "stale",
                reviewOperationId: STALE_OPERATION_ID,
                audit: {
                    ...reviewAudit("location-main@stale"),
                    action: "stale review",
                },
            }),
            { status: "conflict", revision: 1 },
        );
        assert.equal(
            await fixture.database
                .prepare("SELECT COUNT(*) AS count FROM logs")
                .first<number>("count"),
            1,
            "stale review must not write an audit log",
        );

        await fixture.repository.createOffice(
            office("location-audit-failure", ownerId),
        );
        assert.equal(
            (
                await fixture.repository.saveOfficePublicLocationForOwner({
                    officeId: "location-audit-failure",
                    ownerAccountId: ownerId,
                    latitudeE1: 300,
                    longitudeE1: 1200,
                    expectedRevision: null,
                    submittedAt: SUBMITTED_AT,
                })
            ).status,
            "saved",
        );
        await installFailingAuditTrigger(fixture);
        await assert.rejects(
            fixture.repository.reviewOfficePublicLocation({
                officeId: "location-audit-failure",
                decision: "publish",
                expectedRevision: 0,
                reviewedAt: REVIEWED_AT,
                reviewedBy: reviewerId,
                reviewNote: "",
                reviewOperationId: FAILED_OPERATION_ID,
                audit: reviewAudit("location-audit-failure@1"),
            }),
            /forced Fudaba location audit failure/,
        );
        await removeFailingAuditTrigger(fixture);
        const auditFailureLocation =
            await fixture.repository.findOfficePublicLocationForOwner(
                "location-audit-failure",
                ownerId,
            );
        assert.equal(auditFailureLocation?.review_state, "pending");
        assert.equal(auditFailureLocation?.revision, 0);
        assert.equal(
            await fixture.database
                .prepare(
                    `SELECT COUNT(*) AS count FROM logs
         WHERE target='location-audit-failure@1'`,
                )
                .first<number>("count"),
            0,
        );
        assert.equal(
            (
                await fixture.repository.withdrawOfficePublicLocationForOwner({
                    officeId: "location-audit-failure",
                    ownerAccountId: ownerId,
                    expectedRevision: 0,
                })
            ).status,
            "saved",
        );

        const resubmitted =
            await fixture.repository.saveOfficePublicLocationForOwner({
                officeId: "location-main",
                ownerAccountId: ownerId,
                latitudeE1: 313,
                longitudeE1: 1216,
                expectedRevision: 1,
                submittedAt: RESUBMITTED_AT,
            });
        assert.equal(resubmitted.status, "saved");
        if (resubmitted.status !== "saved") return;
        assert.equal(resubmitted.location.revision, 2);
        assert.equal(resubmitted.location.review_state, "pending");
        assert.equal(resubmitted.location.reviewed_at, null);
        assert.equal(resubmitted.location.reviewed_by, null);
        assert.equal(resubmitted.location.review_note, "");
        assert.equal(
            await fixture.database
                .prepare(
                    `SELECT review_audit_id FROM fudaba_office_public_locations
         WHERE office_id='location-main'`,
                )
                .first<string>("review_audit_id"),
            null,
        );

        const sibling = new SqlFudabaRepository(
            fixture.database,
            initializedPostgresSchema,
        );
        await sibling.initialize();
        const concurrent = await Promise.all([
            fixture.repository.saveOfficePublicLocationForOwner({
                officeId: "location-main",
                ownerAccountId: ownerId,
                latitudeE1: 314,
                longitudeE1: 1217,
                expectedRevision: 2,
                submittedAt: REVIEWED_AT,
            }),
            sibling.saveOfficePublicLocationForOwner({
                officeId: "location-main",
                ownerAccountId: ownerId,
                latitudeE1: 315,
                longitudeE1: 1218,
                expectedRevision: 2,
                submittedAt: REVIEWED_AT,
            }),
        ]);
        assert.deepEqual(concurrent.map((result) => result.status).sort(), [
            "conflict",
            "saved",
        ]);
        const current = await fixture.repository.findOfficePublicLocationForOwner(
            "location-main",
            ownerId,
        );
        assert.equal(current?.revision, 3);

        await fixture.database
            .prepare(
                "UPDATE fudaba_offices SET status='archived', archived_at=? WHERE id=?",
            )
            .bind(REVIEWED_AT, "location-main")
            .run();
        const withdrawn =
            await fixture.repository.withdrawOfficePublicLocationForOwner({
                officeId: "location-main",
                ownerAccountId: ownerId,
                expectedRevision: 3,
            });
        assert.equal(withdrawn.status, "saved");
        assert.equal(
            await fixture.repository.findOfficePublicLocationForOwner(
                "location-main",
                ownerId,
            ),
            null,
        );

        await fixture.database
            .prepare("UPDATE agencies SET wiki_enabled=? WHERE code='sidem'")
            .bind(false)
            .run();
        const publicInputs = [
            office("map-negative", ownerId, { city: "Beijing", isOpen: false }),
            office("map-positive", ownerId),
            office("map-restricted", restrictedId),
            office("map-suspended", suspendedId),
            office("map-hidden-office", ownerId, { status: "hidden" }),
            office("map-disabled-series", ownerId, { seriesCodes: ["sidem"] }),
            office("map-untagged", ownerId, { seriesCodes: [] }),
            office("map-pending", ownerId),
        ];
        for (const input of publicInputs)
            await fixture.repository.createOffice(input);
        await insertReviewedLocation(fixture, {
            officeId: "map-negative",
            latitudeE1: -32,
            longitudeE1: -456,
            reviewerId,
        });
        await insertReviewedLocation(fixture, {
            officeId: "map-positive",
            latitudeE1: 312,
            longitudeE1: 1215,
            reviewerId,
        });
        await insertReviewedLocation(fixture, {
            officeId: "map-restricted",
            latitudeE1: 313,
            longitudeE1: 1216,
            reviewerId,
        });
        await insertReviewedLocation(fixture, {
            officeId: "map-suspended",
            latitudeE1: 314,
            longitudeE1: 1217,
            reviewerId,
        });
        await insertReviewedLocation(fixture, {
            officeId: "map-hidden-office",
            latitudeE1: 315,
            longitudeE1: 1218,
            reviewerId,
        });
        await insertReviewedLocation(fixture, {
            officeId: "map-disabled-series",
            latitudeE1: 316,
            longitudeE1: 1219,
            reviewerId,
        });
        await insertReviewedLocation(fixture, {
            officeId: "map-untagged",
            latitudeE1: 318,
            longitudeE1: 1221,
            reviewerId,
        });
        assert.equal(
            (
                await fixture.repository.saveOfficePublicLocationForOwner({
                    officeId: "map-pending",
                    ownerAccountId: ownerId,
                    latitudeE1: 317,
                    longitudeE1: 1220,
                    expectedRevision: null,
                    submittedAt: SUBMITTED_AT,
                })
            ).status,
            "saved",
        );

        const worldwide = await fixture.repository.listPublicMapOffices({
            bbox: { westE1: -1800, southE1: -900, eastE1: 1800, northE1: 900 },
            limit: 20,
        });
        assert.deepEqual(
            worldwide.map(({ id }) => id),
            ["map-negative", "map-positive", "map-restricted", "map-untagged"],
        );
        const mapRecord = worldwide[1] as unknown as Record<string, unknown>;
        assert.equal(typeof mapRecord.address, "string");
        for (const privateKey of [
            "owner_account_id",
            "latitude",
            "longitude",
            "review_state",
            "reviewed_by",
            "review_note",
            "review_audit_id",
        ]) {
            assert.equal(privateKey in mapRecord, false, privateKey);
        }
        assert.deepEqual(
            await fixture.repository
                .listPublicMapOffices({
                    bbox: {
                        westE1: 1215,
                        southE1: 312,
                        eastE1: 1215,
                        northE1: 312,
                    },
                    city: "Shanghai",
                    seriesCodes: ["765", "cg"],
                    isOpen: true,
                    limit: 20,
                })
                .then((rows) => rows.map(({ id }) => id)),
            ["map-positive"],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicMapOffices({
                    bbox: {
                        westE1: -456,
                        southE1: -32,
                        eastE1: -456,
                        northE1: -32,
                    },
                    isOpen: false,
                    limit: 20,
                })
                .then((rows) => rows.map(({ id }) => id)),
            ["map-negative"],
        );

        const pendingReviews = await fixture.repository.listOfficeLocationReviews({
            reviewState: "pending",
            limit: 20,
        });
        assert.deepEqual(
            pendingReviews.map(({ office_id }) => office_id),
            ["location-hidden", "map-pending"],
        );
        assert.equal(pendingReviews[1]?.office_name, "Office map-pending");
        assert.equal(pendingReviews[1]?.owner_account_id, ownerId);

        const adminAccounts = new SqlAdminAccountRepository(fixture.database);
        assert.equal(
            await adminAccounts.deleteAdminAccount(reviewerId),
            "moderation-history",
        );
        const reviewerTable = "backoffice_accounts";
        assert.equal(
            await fixture.database
                .prepare(
                    `SELECT COUNT(*) AS count FROM ${reviewerTable} WHERE id=?`,
                )
                .bind(reviewerId)
                .first<number>("count"),
            1,
        );
    }

    describe('Fudaba location repository', () => {
        postgresTest("real PostgreSQL enforces Fudaba location CAS and public map eligibility", async () => {
            await assertLocationRepository("postgresql");
        });
    });
}

// fudaba-location-routes.test.ts
{
    const ACCOUNT_ID = "location-owner";
    const OTHER_ACCOUNT_ID = "other-owner";
    const OFFICE_ID = "location-office";
    const PLATFORM_TOKEN = "platform-location-token";
    const PLATFORM_CSRF = "platform-location-csrf";
    const BACKOFFICE_TOKEN = "backoffice-location-token";
    const BACKOFFICE_CSRF = "backoffice-location-csrf";
    const SUBMITTED_AT = "2026-08-03T01:00:00.000Z";

    function officeRecord(
        id = OFFICE_ID,
        ownerAccountId = ACCOUNT_ID,
        status: FudabaOfficeRecord["status"] = "active",
    ): FudabaOfficeRecord {
        return {
            id,
            owner_account_id: ownerAccountId,
            slug: id,
            name: `Office ${id}`,
            intro: "Private intro",
            city: "Shanghai",
            address: "Private exact address",
            latitude: 31.2304,
            longitude: 121.4737,
            accent: "#ef5b6c",
            cover_object_key: null,
            pending_cover_object_key: null,
            pending_cover_submitted_at: null,
            is_open: true,
            visitor_count: 0,
            status,
            revision: 0,
            created_at: SUBMITTED_AT,
            updated_at: SUBMITTED_AT,
            archived_at: status === "archived" ? SUBMITTED_AT : null,
        };
    }

    function pendingLocation(
        officeId = OFFICE_ID,
        overrides: Partial<FudabaOfficePublicLocationRecord> = {},
    ): FudabaOfficePublicLocationRecord {
        return {
            office_id: officeId,
            latitude_e1: 312,
            longitude_e1: 1215,
            review_state: "pending",
            revision: 0,
            submitted_at: SUBMITTED_AT,
            reviewed_at: null,
            reviewed_by: null,
            review_note: "",
            ...overrides,
        };
    }

    class ControlledCache implements CacheStore {
        readonly values = new Map<string, string>();

        async get(key: string): Promise<string | null> {
            return this.values.get(key) ?? null;
        }

        async set(key: string, value: string): Promise<void> {
            this.values.set(key, value);
        }

        async delete(key: string): Promise<void> {
            this.values.delete(key);
        }

        async ping(): Promise<void> {}

        async close(): Promise<void> {}
    }

    class ControlledRateLimiter implements RateLimiter {
        readonly deniedBuckets = new Set<string>();
        readonly calls: Array<{
            bucket: string;
            key: string;
            limit: number;
            windowSeconds: number;
        }> = [];

        async consume(
            bucket: string,
            key: string,
            limit: number,
            windowSeconds: number,
        ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
            this.calls.push({ bucket, key, limit, windowSeconds });
            const allowed = !this.deniedBuckets.has(bucket);
            return {
                allowed,
                remaining: allowed ? Math.max(0, limit - 1) : 0,
                resetAt: Date.now() + 60_000,
            };
        }
    }

    interface FixtureOptions {
        publicReadEnabled?: boolean;
        mapEnabled?: boolean;
        writeEnabled?: boolean;
        accountStatus?: PlatformAccountStatus;
        backofficeDept?: string;
        currentBackofficeDept?: string;
        currentBackofficeMissing?: boolean;
        auditFailure?: boolean;
        geocodingEnabled?: boolean;
    }

    class LocationRouteFixture {
        publicReadEnabled: boolean;
        mapEnabled: boolean;
        writeEnabled: boolean;
        accountStatus: PlatformAccountStatus;
        backofficeDept: string;
        currentBackofficeAccount: BackofficeAccountRecord | null;
        auditFailure: boolean;
        geocodingEnabled: boolean;
        readonly offices = new Map<string, FudabaOfficeRecord>();
        readonly locations = new Map<string, FudabaOfficePublicLocationRecord>();
        readonly mapInputs: ListFudabaPublicMapOfficesInput[] = [];
        readonly reviewInputs: Array<{
            officeId: string;
            decision: "publish" | "reject";
            expectedRevision: number;
            reviewNote: string;
            reviewedAt: string;
            reviewedBy: number;
            reviewOperationId: string;
            audit: AuditLogInput;
        }> = [];
        readonly audit: AuditLogInput[] = [];
        readonly cache = new ControlledCache();
        readonly rateLimiter = new ControlledRateLimiter();
        readonly geocodingRequests: Array<{ url: URL; headers: Headers }> = [];
        readonly mapRows: FudabaPublicMapOfficeRecord[] = [
            {
                id: "map-office-a",
                slug: "map-office-a",
                name: "Map Office A",
                city: "Shanghai",
                // pi-lens-ignore: typos
                address: "West Bund Art Center",
                accent: "#ef5b6c",
                is_open: true,
                series_codes: ["765"],
                latitude_e1: 312,
                longitude_e1: 1215,
            },
            {
                id: "map-office-b",
                slug: "map-office-b",
                name: "Map Office B",
                city: "Beijing",
                address: "Shougang Park",
                accent: "#336699",
                is_open: false,
                series_codes: ["cg"],
                latitude_e1: -32,
                longitude_e1: -456,
            },
        ];
        readonly app: ReturnType<typeof createHonoApp>;

        constructor(options: FixtureOptions = {}) {
            this.publicReadEnabled = options.publicReadEnabled ?? true;
            this.mapEnabled = options.mapEnabled ?? true;
            this.writeEnabled = options.writeEnabled ?? true;
            this.accountStatus = options.accountStatus ?? "active";
            this.backofficeDept = options.backofficeDept ?? "op";
            this.currentBackofficeAccount = options.currentBackofficeMissing
                ? null
                : {
                      id: 7,
                      username: "current-location-reviewer",
                      password: "hash",
                      dept: options.currentBackofficeDept ?? this.backofficeDept,
                      producername: "Current Reviewer",
                      admin_role: "admin",
                  };
            this.auditFailure = options.auditFailure ?? false;
            this.geocodingEnabled = options.geocodingEnabled ?? false;
            this.offices.set(OFFICE_ID, officeRecord());
            this.offices.set(
                "other-office",
                officeRecord("other-office", OTHER_ACCOUNT_ID),
            );
            this.app = createHonoApp(() => this.runtime());
        }

        private identity(): PlatformAccountWithProfile {
            return {
                account: {
                    id: ACCOUNT_ID,
                    status: this.accountStatus,
                    token_version: 0,
                    created_at: 1_700_000_000_000,
                    updated_at: 1_700_000_000_000,
                    deleted_at:
                        this.accountStatus === "deleted" ? 1_700_000_000_000 : null,
                },
                profile: {
                    account_id: ACCOUNT_ID,
                    display_name: "Location Owner",
                    avatar_object_key: null,
                    avatar_external_url: null,
                    home_city: "Shanghai",
                    bio: "",
                    updated_at: 1_700_000_000_000,
                },
            };
        }

        private readonly session: PlatformRefreshSessionRecord = {
            id: "location-session",
            account_id: ACCOUNT_ID,
            token_hash: "token-hash",
            previous_token_hash: null,
            csrf_hash: csrfHash(PLATFORM_CSRF),
            expires_at: Date.now() + 60 * 60 * 1000,
            created_at: Date.now(),
            updated_at: Date.now(),
            revoked_at: null,
            user_agent: null,
            ip_address: null,
            last_seen_at: null,
        };

        readonly fudaba = {
            listPublicMapOffices: async (
                input: ListFudabaPublicMapOfficesInput,
            ) => {
                this.mapInputs.push(input);
                return this.mapRows.slice(0, input.limit);
            },
            findOfficeById: async (id: string) => this.offices.get(id) ?? null,
            findOfficePublicLocationForOwner: async (
                officeId: string,
                ownerAccountId: string,
            ) =>
                this.offices.get(officeId)?.owner_account_id === ownerAccountId
                    ? (this.locations.get(officeId) ?? null)
                    : null,
            saveOfficePublicLocationForOwner: async (input: {
                officeId: string;
                ownerAccountId: string;
                latitudeE1: number;
                longitudeE1: number;
                expectedRevision: number | null;
                submittedAt: string;
            }) => {
                const office = this.offices.get(input.officeId);
                if (
                    !office ||
                    office.owner_account_id !== input.ownerAccountId ||
                    office.status !== "active" ||
                    this.accountStatus !== "active"
                ) {
                    return { status: "unavailable" as const };
                }
                const current = this.locations.get(input.officeId);
                if (
                    (current && current.revision !== input.expectedRevision) ||
                    (!current && input.expectedRevision !== null)
                ) {
                    return current
                        ? {
                              status: "conflict" as const,
                              revision: current.revision,
                          }
                        : { status: "unavailable" as const };
                }
                const saved = pendingLocation(input.officeId, {
                    latitude_e1: input.latitudeE1,
                    longitude_e1: input.longitudeE1,
                    revision: current ? current.revision + 1 : 0,
                    submitted_at: input.submittedAt,
                });
                this.locations.set(input.officeId, saved);
                return { status: "saved" as const, location: { ...saved } };
            },
            withdrawOfficePublicLocationForOwner: async (input: {
                officeId: string;
                ownerAccountId: string;
                expectedRevision: number;
            }) => {
                const office = this.offices.get(input.officeId);
                const current = this.locations.get(input.officeId);
                if (
                    !office ||
                    office.owner_account_id !== input.ownerAccountId ||
                    !current
                ) {
                    return { status: "unavailable" as const };
                }
                if (current.revision !== input.expectedRevision) {
                    return {
                        status: "conflict" as const,
                        revision: current.revision,
                    };
                }
                this.locations.delete(input.officeId);
                return { status: "saved" as const, location: current };
            },
            listCardClaimsForOwner: async () => [],
            createCardClaimForOwner: async () => ({ status: "unavailable" as const }),
            listOfficeLocationReviews: async (input: {
                reviewState?: FudabaOfficePublicLocationRecord["review_state"];
                limit: number;
            }): Promise<FudabaOfficeLocationReviewRecord[]> =>
                [...this.locations.values()]
                    .filter(
                        (location) =>
                            !input.reviewState ||
                            location.review_state === input.reviewState,
                    )
                    .slice(0, input.limit)
                    .map((location) => ({
                        ...location,
                        office_name:
                            this.offices.get(location.office_id)?.name ?? "Office",
                        office_city:
                            this.offices.get(location.office_id)?.city ??
                            "Shanghai",
                        owner_account_id:
                            this.offices.get(location.office_id)
                                ?.owner_account_id ?? "",
                    })),
            reviewOfficePublicLocation: async (input: {
                officeId: string;
                decision: "publish" | "reject";
                expectedRevision: number;
                reviewedAt: string;
                reviewedBy: number;
                reviewNote: string;
                reviewOperationId: string;
                audit: AuditLogInput;
            }) => {
                this.reviewInputs.push(input);
                const current = this.locations.get(input.officeId);
                if (!current) return { status: "unavailable" as const };
                if (current.revision !== input.expectedRevision) {
                    return {
                        status: "conflict" as const,
                        revision: current.revision,
                    };
                }
                if (this.auditFailure) throw new Error("injected audit failure");
                const saved: FudabaOfficePublicLocationRecord = {
                    ...current,
                    review_state:
                        input.decision === "publish" ? "published" : "rejected",
                    revision: current.revision + 1,
                    reviewed_at: input.reviewedAt,
                    reviewed_by: input.reviewedBy,
                    review_note: input.reviewNote,
                };
                this.locations.set(input.officeId, saved);
                this.audit.push(input.audit);
                return { status: "saved" as const, location: { ...saved } };
            },
        } as unknown as FudabaRepository;

        runtime(): RuntimeServices {
            return {
                fudaba: this.fudaba,
                cache: this.cache,
                rateLimiter: this.rateLimiter,
                fetch: async (input, init) => {
                    const url =
                        input instanceof URL ? input : new URL(String(input));
                    const headers = new Headers(init?.headers);
                    this.geocodingRequests.push({ url, headers });
                    return new Response(
                        JSON.stringify([
                            {
                                place_id: 100,
                                osm_type: "way",
                                osm_id: 200,
                                name: "西岸艺术中心",
                                display_name: "西岸艺术中心，徐汇区，上海市，中国",
                                lat: "31.1842",
                                lon: "121.4665",
                                address: { city: "上海市" },
                            },
                        ]),
                        {
                            headers: { "content-type": "application/json" },
                        },
                    );
                },
                platformAccounts: {
                    findRefreshSessionById: async (id: string) =>
                        id === this.session.id ? { ...this.session } : null,
                    findAccountWithProfileById: async (id: string) =>
                        id === ACCOUNT_ID ? this.identity() : null,
                    revokeRefreshSession: async () => true,
                } as unknown as NonNullable<RuntimeServices["platformAccounts"]>,
                platformTokens: {
                    async sign() {
                        return PLATFORM_TOKEN;
                    },
                    async verify(token: string) {
                        if (token !== PLATFORM_TOKEN)
                            throw new Error("wrong token realm");
                        const now = Math.floor(Date.now() / 1000);
                        return {
                            iss: "imsweb" as const,
                            aud: "ims-platform" as const,
                            kind: "platform" as const,
                            id: ACCOUNT_ID,
                            tokenVersion: 0,
                            sessionId: "location-session",
                            csrfSecret: PLATFORM_CSRF,
                            jti: "location-access",
                            iat: now,
                            exp: now + 900,
                        };
                    },
                },
                backofficeTokens: {
                    async sign() {
                        return BACKOFFICE_TOKEN;
                    },
                    verify: async (token: string) => {
                        if (token !== BACKOFFICE_TOKEN)
                            throw new Error("wrong token realm");
                        return {
                            iss: "imsweb" as const,
                            aud: "ims-backoffice" as const,
                            kind: "backoffice" as const,
                            id: 7,
                            username: "location-reviewer",
                            producername: "Reviewer",
                            dept: this.backofficeDept,
                            csrfSecret: BACKOFFICE_CSRF,
                        };
                    },
                },
                backofficeAuth: {
                    findUserById: async (id: number) =>
                        id === 7 ? this.currentBackofficeAccount : null,
                } as NonNullable<RuntimeServices["backofficeAuth"]>,
                audit: {
                    insertAuditLog: async (input) => {
                        this.audit.push(input);
                    },
                    listRecentAuditLogs: async () => [],
                },
                config: {
                    fudabaPublicReadEnabled: this.publicReadEnabled,
                    fudabaWriteEnabled: this.writeEnabled,
                    fudabaMapEnabled: this.mapEnabled,
                    fudabaMapStyleUrl: "/api/community/exchange/map/style.json",
                    fudabaGeocoding: {
                        enabled: this.geocodingEnabled,
                        endpoint: this.geocodingEnabled
                            ? "https://nominatim.example.test/search"
                            : "",
                        userAgent: this.geocodingEnabled
                            ? "IMSWeb tests (contact: test@example.test)"
                            : "",
                        countryCodes: "cn",
                    },
                },
            };
        }
    }

    function platformBearerHeaders(extra: Record<string, string> = {}) {
        return bearerTokenHeaders(PLATFORM_TOKEN, extra);
    }

    function platformCookieHeaders(includeCsrf = true) {
        return cookieCsrfHeaders([
            [PLATFORM_ACCESS_TOKEN_COOKIE, PLATFORM_TOKEN],
            [PLATFORM_CSRF_TOKEN_COOKIE, PLATFORM_CSRF],
        ], includeCsrf ? PLATFORM_CSRF : null);
    }

    function backofficeCookieHeaders(includeCsrf = true) {
        return cookieCsrfHeaders([
            [BACKOFFICE_ACCESS_TOKEN_COOKIE, BACKOFFICE_TOKEN],
            [BACKOFFICE_CSRF_TOKEN_COOKIE, BACKOFFICE_CSRF],
        ], includeCsrf ? BACKOFFICE_CSRF : null);
    }

    test.describe('Fudaba location routes', () => {
        test("map config and offices require both flags and expose strict regional DTOs", async () => {
            for (const options of [
                { publicReadEnabled: false, mapEnabled: true },
                { publicReadEnabled: true, mapEnabled: false },
            ]) {
                const disabled = new LocationRouteFixture(options);
                const disabledConfig = await disabled.app.request(
                    "http://ims.test/api/community/exchange/map/config",
                );
                assert.equal(disabledConfig.status, 404);
                assert.match(disabledConfig.headers.get("content-type") ?? "", /^text\/plain/i);
                assert.equal(await disabledConfig.text(), "Not Found");
                const disabledOffices = await disabled.app.request(
                    "http://ims.test/api/community/exchange/map/offices?bbox=-180,-90,180,90",
                );
                assert.equal(disabledOffices.status, 404);
                assert.match(disabledOffices.headers.get("content-type") ?? "", /^text\/plain/i);
                assert.equal(await disabledOffices.text(), "Not Found");
            }

            const fixture = new LocationRouteFixture();
            const config = await fixture.app.request(
                "http://ims.test/api/community/exchange/map/config",
            );
            assert.equal(config.status, 200);
            assert.deepEqual(await contractJson(config, fudabaMapConfigSchema), {
                styleUrl: "/api/community/exchange/map/style.json",
            });
            assert.equal(config.headers.get("cache-control"), "private, no-store");

            const response = await fixture.app.request(
                "http://ims.test/api/community/exchange/map/offices?" +
                    "bbox=121.41,31.11,121.59,31.29&city=Shanghai" +
                    "&series=765&series=cg&open=true&limit=1",
            );
            assert.equal(response.status, 200);
            assert.deepEqual(await contractJson(response, fudabaMapOfficeListSchema), {
                items: [
                    {
                        id: "map-office-a",
                        slug: "map-office-a",
                        name: "Map Office A",
                        city: "Shanghai",
                        // pi-lens-ignore: typos
                        address: "West Bund Art Center",
                        accent: "#ef5b6c",
                        isOpen: true,
                        seriesCodes: ["765"],
                        location: {
                            latitude: 31.2,
                            longitude: 121.5,
                            precision: "regional",
                        },
                    },
                ],
                truncated: true,
            });
            assert.deepEqual(fixture.mapInputs.at(-1), {
                bbox: { westE1: 1215, southE1: 312, eastE1: 1215, northE1: 312 },
                city: "Shanghai",
                seriesCodes: ["765", "cg"],
                isOpen: true,
                limit: 2,
            });

            await fixture.app.request(
                "http://ims.test/api/community/exchange/map/offices?" +
                    "bbox=-45.69,-3.29,-45.51,-3.11",
            );
            assert.deepEqual(fixture.mapInputs.at(-1)?.bbox, {
                westE1: -456,
                southE1: -32,
                eastE1: -456,
                northE1: -32,
            });
        });

        test("map query rejects missing, duplicate, unknown, invalid, and antimeridian input", async () => {
            const fixture = new LocationRouteFixture();
            for (const query of [
                "",
                "?bbox=-180,-90,180,90&bbox=-10,-10,10,10",
                "?bbox=-180,-90,180,90&unknown=1",
                "?bbox=170,-10,-170,10",
                "?bbox=-181,-10,10,10",
                "?bbox=-10,10,10,-10",
                "?bbox=-10,-10,10,10&limit=501",
                "?bbox=-10,-10,10,10&open=1",
                "?bbox=-10,-10,10,10&series=765&series=765",
                "?bbox=-10,-10,10,10&series=invalid%21",
            ]) {
                const response = await fixture.app.request(
                    `http://ims.test/api/community/exchange/map/offices${query}`,
                );
                assert.equal(response.status, 400, query);
                if (query.includes("unknown")) {
                    await contractJson(response, fudabaErrorResponseSchema);
                }
            }
        });

        test("place search requires auth, validates input, caches results, and rate limits the provider", async () => {
            const enabled = new LocationRouteFixture({ geocodingEnabled: true });
            const searchPath =
                "/api/community/exchange/places/search?q=" +
                encodeURIComponent("西岸艺术中心");
            assert.equal(
                (await enabled.app.request(`http://ims.test${searchPath}`)).status,
                401,
            );

            const disabled = new LocationRouteFixture();
            assert.equal(
                (
                    await disabled.app.request(`http://ims.test${searchPath}`, {
                        headers: platformBearerHeaders(),
                    })
                ).status,
                503,
            );
            assert.equal(
                (
                    await enabled.app.request(
                        "http://ims.test/api/community/exchange/places/search?q=x",
                        { headers: platformBearerHeaders() },
                    )
                ).status,
                400,
            );

            const response = await enabled.app.request(`http://ims.test${searchPath}`, {
                headers: platformBearerHeaders(),
            });
            assert.equal(response.status, 200);
            assert.deepEqual(await contractJson(response, fudabaPlaceSearchResponseSchema), {
                success: true,
                items: [
                    {
                        id: "way:200",
                        label: "西岸艺术中心",
                        address: "西岸艺术中心，徐汇区，上海市，中国",
                        city: "上海市",
                        location: {
                            latitude: 31.1842,
                            longitude: 121.4665,
                            precision: "exact",
                        },
                    },
                ],
                attribution: "© OpenStreetMap contributors",
            });
            assert.equal(response.headers.get("cache-control"), "private, no-store");
            assert.equal(enabled.geocodingRequests.length, 1);
            const request = enabled.geocodingRequests[0]!;
            assert.equal(request.url.searchParams.get("q"), "西岸艺术中心");
            assert.equal(request.url.searchParams.get("format"), "jsonv2");
            assert.equal(request.url.searchParams.get("addressdetails"), "1");
            assert.equal(request.url.searchParams.get("limit"), "5");
            assert.equal(request.url.searchParams.get("countrycodes"), "cn");
            assert.equal(
                request.headers.get("user-agent"),
                "IMSWeb tests (contact: test@example.test)",
            );

            const cached = await enabled.app.request(`http://ims.test${searchPath}`, {
                headers: platformBearerHeaders(),
            });
            assert.equal(cached.status, 200);
            assert.equal(enabled.geocodingRequests.length, 1);
            assert.equal(
                enabled.rateLimiter.calls.filter(
                    (call) => call.bucket === "fudaba-geocoding-provider",
                ).length,
                1,
            );

            enabled.rateLimiter.deniedBuckets.add("fudaba-geocoding-provider");
            const busy = await enabled.app.request(
                "http://ims.test/api/community/exchange/places/search?q=" +
                    encodeURIComponent("首钢园"),
                { headers: platformBearerHeaders() },
            );
            assert.equal(busy.status, 429);
            assert.equal(busy.headers.get("retry-after"), "60");
        });

        test("mounted claim routes authenticate reads, reject unknown mutation fields, and preserve business errors", async () => {
            const fixture = new LocationRouteFixture();
            const list = await fixture.app.request(
                "http://ims.test/api/community/exchange/me/card-claims",
                { headers: platformBearerHeaders() },
            );
            assert.equal(list.status, 200);
            assert.deepEqual(await contractJson(list, ownerClaimListSchema), { items: [] });

            const invalid = await fixture.app.request(
                "http://ims.test/api/community/exchange/legacy-cards/42/claims",
                {
                    method: "POST",
                    headers: platformBearerHeaders({ "content-type": "application/json" }),
                    body: JSON.stringify({
                        targetCardId: null,
                        seriesCode: "765",
                        favoriteIdolIds: [1],
                        message: "claim this card",
                        unexpected: true,
                    }),
                },
            );
            assert.equal(invalid.status, 400);
            await contractJson(invalid, fudabaCardClaimErrorSchema);

            const unavailable = await fixture.app.request(
                "http://ims.test/api/community/exchange/legacy-cards/42/claims",
                {
                    method: "POST",
                    headers: platformBearerHeaders({ "content-type": "application/json" }),
                    body: JSON.stringify({
                        targetCardId: null,
                        seriesCode: "765",
                        favoriteIdolIds: [1],
                        message: "claim this card",
                    }),
                },
            );
            assert.equal(unavailable.status, 404);
            assert.deepEqual(
                await contractJson(unavailable, fudabaCardClaimErrorSchema),
                { success: false, code: "FUDABA_LEGACY_CARD_UNAVAILABLE" },
            );
        });

        test("owner locations enforce Platform auth, active account, CSRF, quantization, and CAS", async () => {
            const fixture = new LocationRouteFixture();
            assert.equal(
                (
                    await fixture.app.request(
                        `http://ims.test/api/community/exchange/me/offices/${OFFICE_ID}/location`,
                    )
                ).status,
                401,
            );
            const empty = await fixture.app.request(
                `http://ims.test/api/community/exchange/me/offices/${OFFICE_ID}/location`,
                { headers: platformBearerHeaders() },
            );
            assert.equal(empty.status, 200);
            assert.deepEqual(await contractJson(empty, fudabaOwnerLocationDetailSchema), {
                location: null,
            });
            assert.equal(
                (
                    await fixture.app.request(
                        "http://ims.test/api/community/exchange/me/offices/other-office/location",
                        { headers: platformBearerHeaders() },
                    )
                ).status,
                404,
            );

            const path = `/api/community/exchange/me/offices/${OFFICE_ID}/location`;
            const body = JSON.stringify({
                latitude: -3.24,
                longitude: 121.46,
                expectedRevision: null,
            });
            assert.equal(
                (
                    await fixture.app.request(`http://ims.test${path}`, {
                        method: "PUT",
                        headers: {
                            ...platformCookieHeaders(false),
                            "content-type": "application/json",
                        },
                        body,
                    })
                ).status,
                403,
            );

            const saved = await fixture.app.request(`http://ims.test${path}`, {
                method: "PUT",
                headers: {
                    ...platformCookieHeaders(),
                    "content-type": "application/json",
                },
                body,
            });
            assert.equal(saved.status, 200);
            const savedPayload = await contractJson(
                saved,
                fudabaOwnerLocationMutationResponseSchema
            );
            assert.equal(
                new Date(savedPayload.officeLocation.submittedAt).toISOString(),
                savedPayload.officeLocation.submittedAt,
            );
            assert.deepEqual(savedPayload.officeLocation, {
                officeId: OFFICE_ID,
                location: { latitude: -3.2, longitude: 121.5, precision: "regional" },
                reviewState: "pending",
                revision: 0,
                submittedAt: savedPayload.officeLocation.submittedAt,
                reviewedAt: null,
                reviewNote: "",
            });
            const stored = fixture.locations.get(OFFICE_ID);
            assert.equal(stored?.latitude_e1, -32);
            assert.equal(stored?.longitude_e1, 1215);

            for (const latitude of [-60.1, 60.1]) {
                const invalidLatitude = await fixture.app.request(
                    `http://ims.test${path}`,
                    {
                        method: "PUT",
                        headers: platformBearerHeaders({
                            "content-type": "application/json",
                        }),
                        body: JSON.stringify({
                            latitude,
                            longitude: 121.5,
                            expectedRevision: 0,
                        }),
                    },
                );
                assert.equal(invalidLatitude.status, 400, `latitude=${latitude}`);
            }

            const stale = await fixture.app.request(`http://ims.test${path}`, {
                method: "PUT",
                headers: {
                    ...platformBearerHeaders({ "content-type": "application/json" }),
                },
                body: JSON.stringify({
                    latitude: 31.2,
                    longitude: 121.5,
                    expectedRevision: null,
                }),
            });
            assert.equal(stale.status, 409);
            assert.equal(((await stale.json()) as { revision: number }).revision, 0);

            const staleDelete = await fixture.app.request(`http://ims.test${path}`, {
                method: "DELETE",
                headers: platformBearerHeaders({ "content-type": "application/json" }),
                body: JSON.stringify({ expectedRevision: 1 }),
            });
            assert.equal(staleDelete.status, 409);
            const removed = await fixture.app.request(`http://ims.test${path}`, {
                method: "DELETE",
                headers: platformBearerHeaders({ "content-type": "application/json" }),
                body: JSON.stringify({ expectedRevision: 0 }),
            });
            assert.equal(removed.status, 200);
            assert.deepEqual(
                await contractJson(removed, fudabaOwnerLocationWithdrawalResponseSchema),
                { success: true }
            );

            const restricted = new LocationRouteFixture({
                accountStatus: "restricted",
            });
            assert.equal(
                (
                    await restricted.app.request(`http://ims.test${path}`, {
                        method: "PUT",
                        headers: platformBearerHeaders({
                            "content-type": "application/json",
                        }),
                        body,
                    })
                ).status,
                403,
            );
        });

        test("admin review ignores rollout flags but requires Backoffice op, CSRF, CAS, and audit", async () => {
            const fixture = new LocationRouteFixture({
                publicReadEnabled: false,
                mapEnabled: false,
                writeEnabled: false,
            });
            fixture.locations.set(OFFICE_ID, pendingLocation());
            const listPath =
                "/api/admin/community/exchange/office-locations?state=pending&limit=20";
            assert.equal(
                (await fixture.app.request(`http://ims.test${listPath}`)).status,
                401,
            );
            assert.equal(
                (
                    await fixture.app.request(`http://ims.test${listPath}`, {
                        headers: platformBearerHeaders(),
                    })
                ).status,
                401,
            );
            const listed = await fixture.app.request(`http://ims.test${listPath}`, {
                headers: { authorization: `Bearer ${BACKOFFICE_TOKEN}` },
            });
            assert.equal(listed.status, 200);
            assert.equal(listed.headers.get("cache-control"), "private, no-store");
            assert.equal(
                (await contractJson(listed, fudabaLocationReviewListSchema)).items.length,
                1,
            );

            const path = `/api/admin/community/exchange/office-locations/${OFFICE_ID}`;
            const publishBody = JSON.stringify({
                decision: "publish",
                expectedRevision: 0,
                note: "",
            });
            assert.equal(
                (
                    await fixture.app.request(`http://ims.test${path}`, {
                        method: "PUT",
                        headers: {
                            ...backofficeCookieHeaders(false),
                            "content-type": "application/json",
                        },
                        body: publishBody,
                    })
                ).status,
                403,
            );
            assert.equal(
                (
                    await fixture.app.request(`http://ims.test${path}`, {
                        method: "PUT",
                        headers: {
                            ...backofficeCookieHeaders(),
                            "content-type": "application/json",
                        },
                        body: JSON.stringify({
                            decision: "reject",
                            expectedRevision: 0,
                            note: "   ",
                        }),
                    })
                ).status,
                400,
            );

            const published = await fixture.app.request(`http://ims.test${path}`, {
                method: "PUT",
                headers: {
                    ...backofficeCookieHeaders(),
                    "content-type": "application/json",
                },
                body: publishBody,
            });
            assert.equal(published.status, 200);
            await contractJson(published, fudabaLocationReviewMutationSchema);
            assert.equal(fixture.locations.get(OFFICE_ID)?.review_state, "published");
            assert.equal(fixture.audit.length, 1);
            assert.equal(fixture.audit[0]?.action, "发布 Fudaba 事务所公开位置");
            assert.equal(fixture.audit[0]?.username, "current-location-reviewer");
            assert.equal(fixture.audit[0]?.producername, "Current Reviewer");
            assert.match(
                fixture.reviewInputs[0]?.reviewOperationId ?? "",
                /^[0-9a-f-]{36}$/,
            );

            const stale = await fixture.app.request(`http://ims.test${path}`, {
                method: "PUT",
                headers: {
                    ...backofficeCookieHeaders(),
                    "content-type": "application/json",
                },
                body: publishBody,
            });
            assert.equal(stale.status, 409);
            await contractJson(stale, fudabaLocationReviewErrorSchema);
            assert.equal(fixture.audit.length, 1, "failed review must not be audited");

            const rejected = await fixture.app.request(`http://ims.test${path}`, {
                method: "PUT",
                headers: {
                    ...backofficeCookieHeaders(),
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    decision: "reject",
                    expectedRevision: 1,
                    note: "公开精度仍不合适",
                }),
            });
            assert.equal(rejected.status, 200);
            await contractJson(rejected, fudabaLocationReviewMutationSchema);
            assert.equal(fixture.locations.get(OFFICE_ID)?.review_state, "rejected");
            assert.equal(fixture.audit.at(-1)?.action, "拒绝 Fudaba 事务所公开位置");

            const nonOp = new LocationRouteFixture({ backofficeDept: "design" });
            assert.equal(
                (
                    await nonOp.app.request(
                        "http://ims.test/api/admin/community/exchange/office-locations",
                        { headers: { authorization: `Bearer ${BACKOFFICE_TOKEN}` } },
                    )
                ).status,
                403,
            );

            const deletedCurrentOp = new LocationRouteFixture({
                backofficeDept: "op",
                currentBackofficeMissing: true,
            });
            assert.equal(
                (
                    await deletedCurrentOp.app.request(
                        "http://ims.test/api/admin/community/exchange/office-locations",
                        { headers: { authorization: `Bearer ${BACKOFFICE_TOKEN}` } },
                    )
                ).status,
                403,
            );

            const demotedCurrentOp = new LocationRouteFixture({
                backofficeDept: "op",
                currentBackofficeDept: "design",
            });
            demotedCurrentOp.locations.set(OFFICE_ID, pendingLocation());
            assert.equal(
                (
                    await demotedCurrentOp.app.request(`http://ims.test${path}`, {
                        method: "PUT",
                        headers: {
                            ...backofficeCookieHeaders(),
                            "content-type": "application/json",
                        },
                        body: publishBody,
                    })
                ).status,
                403,
            );
            assert.equal(
                demotedCurrentOp.locations.get(OFFICE_ID)?.review_state,
                "pending",
            );

            const auditFailure = new LocationRouteFixture({ auditFailure: true });
            auditFailure.locations.set(OFFICE_ID, pendingLocation());
            const failedAuditResponse = await auditFailure.app.request(
                `http://ims.test${path}`,
                {
                    method: "PUT",
                    headers: {
                        ...backofficeCookieHeaders(),
                        "content-type": "application/json",
                    },
                    body: publishBody,
                },
            );
            assert.equal(failedAuditResponse.status, 500);
            assert.equal(
                auditFailure.locations.get(OFFICE_ID)?.review_state,
                "pending",
            );
            assert.equal(auditFailure.locations.get(OFFICE_ID)?.revision, 0);
            assert.equal(auditFailure.audit.length, 0);
        });

        test("map and location routes enforce dedicated IP and account limits", async () => {
            const mapLimited = new LocationRouteFixture();
            mapLimited.rateLimiter.deniedBuckets.add("fudaba-map-ip");
            const mapResponse = await mapLimited.app.request(
                "http://ims.test/api/community/exchange/map/offices?bbox=-180,-90,180,90",
            );
            assert.equal(mapResponse.status, 429);
            assert.ok(mapResponse.headers.get("retry-after"));
            assert.ok(
                mapLimited.rateLimiter.calls.some(
                    ({ bucket, limit, windowSeconds }) =>
                        bucket === "fudaba-map-ip" &&
                        limit === 300 &&
                        windowSeconds === 900,
                ),
            );

            const ipLimited = new LocationRouteFixture();
            ipLimited.rateLimiter.deniedBuckets.add("fudaba-location-ip");
            const path = `/api/community/exchange/me/offices/${OFFICE_ID}/location`;
            const init = {
                method: "PUT",
                headers: platformBearerHeaders({ "content-type": "application/json" }),
                body: JSON.stringify({
                    latitude: 31.2,
                    longitude: 121.5,
                    expectedRevision: null,
                }),
            };
            assert.equal(
                (await ipLimited.app.request(`http://ims.test${path}`, init)).status,
                429,
            );
            assert.ok(
                ipLimited.rateLimiter.calls.some(
                    ({ bucket, limit, windowSeconds }) =>
                        bucket === "fudaba-location-ip" &&
                        limit === 60 &&
                        windowSeconds === 3600,
                ),
            );

            const accountLimited = new LocationRouteFixture();
            accountLimited.rateLimiter.deniedBuckets.add("fudaba-location-account");
            assert.equal(
                (await accountLimited.app.request(`http://ims.test${path}`, init))
                    .status,
                429,
            );
            assert.ok(
                accountLimited.rateLimiter.calls.some(
                    ({ bucket, key }) =>
                        bucket === "fudaba-location-account" && key === ACCOUNT_ID,
                ),
            );
            assert.ok(
                accountLimited.rateLimiter.calls.some(
                    ({ bucket, limit, windowSeconds }) =>
                        bucket === "fudaba-location-account" &&
                        limit === 12 &&
                        windowSeconds === 3600,
                ),
            );
        });
    });
}

// fudaba-map-delivery.test.ts
{
    const TOKEN = 'map-delivery-admin-token';
    const OFFICIAL_STYLE = 'https://tiles.openfreemap.org/styles/positron';
    const SELF_HOSTED_STYLE = '/maps/exchange-style.json';
    const OBJECT_STORAGE_STYLE =
        'https://objects.example.test/exchange/releases/v3/exchange-style.json';
    const DYNAMIC_STYLE =
        'https://dynamic.example.test/openmap/v4/exchange-style.json';
    const EDITED_DYNAMIC_STYLE =
        'https://dynamic.example.test/openmap/v5/exchange-style.json';

    class MemoryStorage implements ObjectStorage {
        private readonly objects = new Map<string, StoredObject>();
        private revision = 0;

        async get(key: string): Promise<StoredObject | null> {
            const object = this.objects.get(key);
            return object
                ? { ...object, body: Uint8Array.from(object.body) }
                : null;
        }

        async put(
            key: string,
            body: Uint8Array,
            options: PutObjectOptions = {},
        ): Promise<StoredObject> {
            this.revision += 1;
            const object: StoredObject = {
                body: Uint8Array.from(body),
                size: body.byteLength,
                contentType: options.contentType || 'application/octet-stream',
                etag: `"revision-${this.revision}"`,
            };
            this.objects.set(key, object);
            return { ...object, body: Uint8Array.from(object.body) };
        }

        async putIfUnchanged(
            key: string,
            expectedEtag: string | null,
            body: Uint8Array,
            options: PutObjectOptions = {},
        ): Promise<StoredObject | null> {
            if ((this.objects.get(key)?.etag ?? null) !== expectedEtag) return null;
            return this.put(key, body, options);
        }

        async delete(key: string): Promise<void> {
            this.objects.delete(key);
        }

        async exists(key: string): Promise<boolean> {
            return this.objects.has(key);
        }

        async copy(sourceKey: string, destinationKey: string): Promise<void> {
            const source = await this.get(sourceKey);
            if (!source) throw new Error('source missing');
            await this.put(destinationKey, source.body, {
                contentType: source.contentType,
            });
        }

        async move(sourceKey: string, destinationKey: string): Promise<void> {
            await this.copy(sourceKey, destinationKey);
            await this.delete(sourceKey);
        }

        async list(prefix: string): Promise<ListedObject[]> {
            return [...this.objects.entries()]
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, value]) => ({
                    key,
                    size: value.size,
                    etag: value.etag,
                }));
        }

        async deletePrefix(prefix: string): Promise<void> {
            for (const key of this.objects.keys()) {
                if (key.startsWith(prefix)) this.objects.delete(key);
            }
        }
    }

    function fixture() {
        const storage = new MemoryStorage();
        const audit: AuditLogInput[] = [];
        const services: RuntimeServices = {
            storage,
            config: {
                fudabaPublicReadEnabled: true,
                fudabaMapEnabled: true,
                fudabaMapStyleUrl: OFFICIAL_STYLE,
                fudabaMapStyleUrls: [
                    OFFICIAL_STYLE,
                    SELF_HOSTED_STYLE,
                    OBJECT_STORAGE_STYLE,
                ],
            },
            backofficeTokens: {
                async sign() {
                    return TOKEN;
                },
                async verify(token: string) {
                    if (token !== TOKEN) throw new Error('wrong token realm');
                    return {
                        iss: 'imsweb' as const,
                        aud: 'ims-backoffice' as const,
                        kind: 'backoffice' as const,
                        id: 7,
                        username: 'map-operator',
                        producername: 'Map Operator',
                        dept: 'op',
                        csrfSecret: 'map-delivery-csrf',
                    };
                },
            },
            backofficeAuth: {
                async findUserById(id: number) {
                    return id === 7
                        ? {
                              id: 7,
                              username: 'map-operator',
                              password: 'unused-password-hash',
                              producername: 'Map Operator',
                              dept: 'op',
                              admin_role: 'super_admin' as const,
                          }
                        : null;
                },
            } as NonNullable<RuntimeServices['backofficeAuth']>,
            audit: {
                async insertAuditLog(input) {
                    audit.push(input);
                },
                async listRecentAuditLogs() {
                    return [];
                },
            },
        };
        const app = createHonoApp(() => services);
        const request = (pathname: string, init?: RequestInit) =>
            app.request(`http://ims.test${pathname}`, init);
        const authHeaders = (headers: Record<string, string> = {}) =>
            bearerTokenHeaders(TOKEN, headers);
        const mutation = (
            pathname: string,
            method: 'POST' | 'PUT' | 'DELETE',
            body: unknown,
        ) =>
            request(pathname, {
                method,
                headers: authHeaders({ 'content-type': 'application/json' }),
                body: JSON.stringify(body),
            });
        return { storage, audit, request, authHeaders, mutation };
    }

    interface SourcePayload {
        id: string;
        name: string;
        styleUrl: string;
    }

    interface DeliveryPayload {
        success: true;
        delivery: {
            sources: SourcePayload[];
            activeSourceId: string;
            effectiveStyleUrl: string;
            revision: string | null;
        };
    }

    test.describe('map delivery', () => {
        test('validates raw JSON responses without projecting emitted fields', async () => {
            const { request, authHeaders, mutation } = fixture();

            const unauthorized = await request('/api/admin/community/exchange/map-delivery');
            assert.equal(unauthorized.status, 401);
            await contractJson(unauthorized, fudabaMapDeliveryErrorSchema);

            const read = await request('/api/admin/community/exchange/map-delivery', {
                headers: authHeaders(),
            });
            assert.equal(read.status, 200);
            await contractJson(read, fudabaMapDeliverySnapshotSchema);

            const created = await mutation(
                '/api/admin/community/exchange/map-delivery/sources',
                'POST',
                { name: 'Boundary source', styleUrl: DYNAMIC_STYLE, revision: null },
            );
            assert.equal(created.status, 201);
            await contractJson(created, fudabaMapDeliveryMutationSchema);

            const invalidCases: Array<[string, RequestInit, string]> = [
                [
                    '/api/admin/community/exchange/map-delivery/sources',
                    {
                        method: 'POST',
                        headers: authHeaders({ 'content-type': 'application/json' }),
                        body: '{',
                    },
                    '请求正文必须为 JSON',
                ],
                [
                    '/api/admin/community/exchange/map-delivery/sources',
                    {
                        method: 'POST',
                        headers: authHeaders({ 'content-type': 'application/json' }),
                        body: '[]',
                    },
                    '请求正文必须为 JSON 对象',
                ],
                [
                    '/api/admin/community/exchange/map-delivery/sources',
                    {
                        method: 'POST',
                        headers: authHeaders({ 'content-type': 'application/json' }),
                        body: JSON.stringify({
                            name: 'Boundary source',
                            styleUrl: DYNAMIC_STYLE,
                            revision: null,
                            unexpected: true,
                        }),
                    },
                    '地图源请求格式无效',
                ],
                [
                    '/api/admin/community/exchange/map-delivery/sources',
                    {
                        method: 'POST',
                        headers: authHeaders({ 'content-type': 'application/json' }),
                        body: JSON.stringify({
                            name: 'Boundary\u0001source',
                            styleUrl: DYNAMIC_STYLE,
                            revision: null,
                        }),
                    },
                    '地图源名称格式无效',
                ],
                [
                    '/api/admin/community/exchange/map-delivery/sources/invalid_id',
                    {
                        method: 'PUT',
                        headers: authHeaders({ 'content-type': 'application/json' }),
                        body: JSON.stringify({
                            name: 'Boundary source',
                            styleUrl: DYNAMIC_STYLE,
                            revision: null,
                        }),
                    },
                    '地图源 ID 格式无效',
                ],
            ];
            for (const [path, init, message] of invalidCases) {
                const response = await request(path, init);
                assert.equal(response.status, 422, path);
                assert.deepEqual(await contractJson(response, fudabaMapDeliveryErrorSchema), {
                    error: message,
                });
            }
        });

        test('manages a dynamic source collection with CAS and legacy fallback', async () => {
            const { storage, audit, request, authHeaders, mutation } = fixture();

            const coldConfig = await request('/api/community/exchange/map/config');
            assert.equal(coldConfig.status, 200);
            assert.deepEqual(await coldConfig.json(), { styleUrl: OFFICIAL_STYLE });

            const unauthorized = await request(
                '/api/admin/community/exchange/map-delivery',
            );
            assert.equal(unauthorized.status, 401);

            const coldAdmin = await request(
                '/api/admin/community/exchange/map-delivery',
                { headers: authHeaders() },
            );
            assert.equal(coldAdmin.status, 200);
            const coldSnapshot =
                (await coldAdmin.json()) as DeliveryPayload['delivery'];
            assert.equal(coldSnapshot.sources.length, 3);
            assert.equal(coldSnapshot.sources[0]?.name, 'OpenFreeMap Positron');
            assert.equal(coldSnapshot.activeSourceId, coldSnapshot.sources[0]?.id);
            assert.equal(coldSnapshot.effectiveStyleUrl, OFFICIAL_STYLE);
            assert.equal(coldSnapshot.revision, null);

            const malformed = await mutation(
                '/api/admin/community/exchange/map-delivery/sources',
                'POST',
                { name: 'Broken', styleUrl: 'maps/style.json', revision: null },
            );
            assert.equal(malformed.status, 422);

            const created = await mutation(
                '/api/admin/community/exchange/map-delivery/sources',
                'POST',
                { name: 'Dynamic edge', styleUrl: DYNAMIC_STYLE, revision: null },
            );
            assert.equal(created.status, 201);
            const createdPayload = (await created.json()) as DeliveryPayload;
            const dynamicSource = createdPayload.delivery.sources.find(
                (source) => source.styleUrl === DYNAMIC_STYLE,
            );
            assert.ok(dynamicSource);
            assert.equal(createdPayload.delivery.revision, '"revision-1"');

            const storedObject = await storage.get(FUDABA_MAP_DELIVERY_OBJECT_KEY);
            assert.ok(storedObject);
            const stored = JSON.parse(
                new TextDecoder().decode(storedObject.body),
            ) as Record<string, unknown>;
            assert.equal(stored.version, 2);
            assert.ok(Array.isArray(stored.sources));

            const duplicate = await mutation(
                '/api/admin/community/exchange/map-delivery/sources',
                'POST',
                {
                    name: 'Dynamic edge',
                    styleUrl: 'https://other.example.test/style.json',
                    revision: createdPayload.delivery.revision,
                },
            );
            assert.equal(duplicate.status, 409);

            const edited = await mutation(
                `/api/admin/community/exchange/map-delivery/sources/${dynamicSource.id}`,
                'PUT',
                {
                    name: 'Dynamic edge v5',
                    styleUrl: EDITED_DYNAMIC_STYLE,
                    revision: createdPayload.delivery.revision,
                },
            );
            assert.equal(edited.status, 200);
            const editedPayload = (await edited.json()) as DeliveryPayload;
            assert.equal(editedPayload.delivery.revision, '"revision-2"');
            assert.ok(
                editedPayload.delivery.sources.some(
                    (source) =>
                        source.id === dynamicSource.id &&
                        source.name === 'Dynamic edge v5' &&
                        source.styleUrl === EDITED_DYNAMIC_STYLE,
                ),
            );

            const activated = await mutation(
                '/api/admin/community/exchange/map-delivery/active',
                'PUT',
                {
                    sourceId: dynamicSource.id,
                    revision: editedPayload.delivery.revision,
                },
            );
            assert.equal(activated.status, 200);
            const activatedPayload = (await activated.json()) as DeliveryPayload;
            assert.equal(activatedPayload.delivery.activeSourceId, dynamicSource.id);
            assert.equal(
                activatedPayload.delivery.effectiveStyleUrl,
                EDITED_DYNAMIC_STYLE,
            );
            assert.equal(activatedPayload.delivery.revision, '"revision-3"');

            const selectedConfig = await request('/api/community/exchange/map/config');
            assert.equal(selectedConfig.status, 200);
            assert.deepEqual(await selectedConfig.json(), {
                styleUrl: EDITED_DYNAMIC_STYLE,
            });

            const deleteActive = await mutation(
                `/api/admin/community/exchange/map-delivery/sources/${dynamicSource.id}`,
                'DELETE',
                { revision: activatedPayload.delivery.revision },
            );
            assert.equal(deleteActive.status, 409);

            const inactiveSource = activatedPayload.delivery.sources.find(
                (source) => source.styleUrl === SELF_HOSTED_STYLE,
            );
            assert.ok(inactiveSource);
            const deleted = await mutation(
                `/api/admin/community/exchange/map-delivery/sources/${inactiveSource.id}`,
                'DELETE',
                { revision: activatedPayload.delivery.revision },
            );
            assert.equal(deleted.status, 200);
            const deletedPayload = (await deleted.json()) as DeliveryPayload;
            assert.equal(deletedPayload.delivery.revision, '"revision-4"');
            assert.ok(
                !deletedPayload.delivery.sources.some(
                    (source) => source.id === inactiveSource.id,
                ),
            );

            const stale = await mutation(
                '/api/admin/community/exchange/map-delivery/active',
                'PUT',
                {
                    sourceId: coldSnapshot.activeSourceId,
                    revision: '"revision-2"',
                },
            );
            assert.equal(stale.status, 409);
            assert.deepEqual(
                audit.map((entry) => entry.action),
                [
                    '新增交换地图源',
                    '编辑交换地图源',
                    '激活交换地图源',
                    '删除交换地图源',
                ],
            );

            await storage.put(
                FUDABA_MAP_DELIVERY_OBJECT_KEY,
                new TextEncoder().encode(
                    JSON.stringify({
                        styleUrl: OBJECT_STORAGE_STYLE,
                        updatedAt: new Date().toISOString(),
                    }),
                ),
                { contentType: 'application/json; charset=utf-8' },
            );
            const legacyAdmin = await request(
                '/api/admin/community/exchange/map-delivery',
                { headers: authHeaders() },
            );
            const legacySnapshot =
                (await legacyAdmin.json()) as DeliveryPayload['delivery'];
            assert.equal(legacySnapshot.effectiveStyleUrl, OBJECT_STORAGE_STYLE);
            assert.equal(
                legacySnapshot.sources.find(
                    (source) => source.id === legacySnapshot.activeSourceId,
                )?.styleUrl,
                OBJECT_STORAGE_STYLE,
            );

            await storage.put(
                FUDABA_MAP_DELIVERY_OBJECT_KEY,
                new TextEncoder().encode(
                    JSON.stringify({
                        version: 2,
                        sources: [
                            {
                                id: 'poisoned',
                                name: 'Poisoned',
                                styleUrl:
                                    'https://user:secret@attacker.example/style.json',
                            },
                        ],
                        activeSourceId: 'poisoned',
                    }),
                ),
                { contentType: 'application/json; charset=utf-8' },
            );

            const poisonedConfig = await request('/api/community/exchange/map/config');
            assert.equal(poisonedConfig.status, 200);
            assert.deepEqual(await poisonedConfig.json(), { styleUrl: OFFICIAL_STYLE });

            const poisonedAdmin = await request(
                '/api/admin/community/exchange/map-delivery',
                { headers: authHeaders() },
            );
            const poisonedSnapshot =
                (await poisonedAdmin.json()) as DeliveryPayload['delivery'];
            assert.equal(poisonedSnapshot.effectiveStyleUrl, OFFICIAL_STYLE);
            assert.equal(poisonedSnapshot.revision, '"revision-6"');
        });
    });
}

// fudaba-office-management-repository.test.ts
{
    const CREATED_AT = '2026-08-03T01:00:00.000Z';
    const UPDATED_AT = '2026-08-03T02:00:00.000Z';
    const LATER_AT = '2026-08-03T03:00:00.000Z';
    const RECEIPT_RACE_LOCK = [18_003, 18] as const;

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined
    };

    interface Fixture {
        database: ManagedSqlDatabase;
        repository: SqlFudabaRepository;
        dialect: 'postgresql';
    }

    class InterleavingStatement implements SqlStatement {
        constructor(
            private readonly statement: SqlStatement,
            private readonly afterRead: () => Promise<void>
        ) {}

        bind(...values: unknown[]): SqlStatement {
            return new InterleavingStatement(
                this.statement.bind(...values),
                this.afterRead
            );
        }

        async first<Value = Record<string, unknown>>(
            column?: string
        ): Promise<Value | null> {
            const result = await this.statement.first<Value>(column);
            await this.afterRead();
            return result;
        }

        async all<Row = Record<string, unknown>>(): Promise<SqlResult<Row>> {
            const result = await this.statement.all<Row>();
            await this.afterRead();
            return result;
        }

        async run<Row = Record<string, unknown>>(): Promise<SqlResult<Row>> {
            const result = await this.statement.run<Row>();
            await this.afterRead();
            return result;
        }
    }

    class InterleavingOwnerReadDatabase implements ManagedSqlDatabase {
        private armed = true;

        constructor(
            private readonly database: ManagedSqlDatabase,
            private readonly interleave: () => Promise<void>
        ) {
        }

        prepare(sql: string): SqlStatement {
            const statement = this.database.prepare(sql);
            if (!/\bFROM\s+fudaba_offices(?:\s+office)?\b/i.test(sql) ||
                !/\bowner_account_id\b/i.test(sql)) {
                return statement;
            }
            return new InterleavingStatement(statement, async () => {
                if (!this.armed) return;
                this.armed = false;
                await this.interleave();
            });
        }

        batch<Row = Record<string, unknown>>(
            statements: SqlStatement[]
        ): Promise<SqlResult<Row>[]> {
            return this.database.batch<Row>(statements);
        }

        executeScript(sql: string): Promise<void> {
            return this.database.executeScript(sql);
        }

        transaction<Value>(
            operation: (database: SqlDatabase) => Promise<Value>
        ): Promise<Value> {
            return this.database.transaction(operation);
        }

        close(): Promise<void> {
            return Promise.resolve();
        }
    }

    async function createFixture(
        dialect: Fixture['dialect']
    ): Promise<Fixture> {
        const harness = await createPostgresTestHarness();
        const repository = new SqlFudabaRepository(
            harness.connection,
            initializedPostgresSchema
        );
        onTestFinished(() => harness.close());
        await repository.initialize();
        await seedCanonicalFudabaAgencies(harness.connection);
        return { database: harness.connection, repository, dialect };
    }

    async function seedAccount(
        fixture: Fixture,
        id: string,
        status: PlatformAccountStatus = 'active'
    ): Promise<void> {
        await fixture.database.prepare(
            `INSERT INTO platform_accounts
            (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, 0, 1700000000000, 1700000000000, ?)`
        ).bind(id, status, status === 'deleted' ? 1700000000000 : null).run();
    }

    function office(
        id: string,
        ownerAccountId: string,
        overrides: Partial<CreateOwnedFudabaOfficeInput> = {}
    ): CreateOwnedFudabaOfficeInput {
        return {
            id,
            ownerAccountId,
            slug: id,
            name: `Office ${id}`,
            intro: 'Owner intro',
            city: 'Shanghai',
            address: '765 Producer Street',
            latitude: 31.2304,
            longitude: 121.4737,
            accent: '#ef5b6c',
            coverObjectKey: null,
            isOpen: true,
            visitorCount: 0,
            status: 'active',
            revision: 0,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
            archivedAt: null,
            seriesCodes: ['765'],
            idempotencyKeyHash: hash(`key:${id}`),
            requestHash: hash(`request:${id}`),
            receiptCreatedAt: 1_775_100_000_000,
            ...overrides
        };
    }

    async function seedPendingLocation(
        fixture: Fixture,
        officeId: string
    ): Promise<void> {
        await fixture.database.prepare(
            `INSERT INTO fudaba_office_public_locations
            (office_id, latitude_e1, longitude_e1, review_state, revision,
             submitted_at, reviewed_at, reviewed_by, review_note)
         VALUES (?, 312, 1215, 'pending', 0, ?, NULL, NULL, '')`
        ).bind(officeId, CREATED_AT).run();
    }

    async function countOrphanedOfficeCreateReceipts(
        fixture: Fixture
    ): Promise<number> {
        return Number(await fixture.database.prepare(
            `SELECT COUNT(*) AS count
         FROM fudaba_mutation_receipts receipt
         LEFT JOIN fudaba_offices office
           ON office.id=receipt.resource_id
          AND office.owner_account_id=receipt.account_id
         WHERE receipt.scope='office-create' AND office.id IS NULL`
        ).first<number>('count') ?? 0);
    }

    function delay(milliseconds: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    async function waitForAdvisoryLockWaiter(fixture: Fixture): Promise<void> {
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
            const waiting = await fixture.database.prepare(
                `SELECT EXISTS (
                 SELECT 1 FROM pg_locks
                 WHERE locktype='advisory' AND NOT granted
                   AND database=(
                       SELECT oid FROM pg_database WHERE datname=current_database()
                   )
             ) AS waiting`
            ).first<boolean>('waiting');
            if (waiting) return;
            await delay(10);
        }
        throw new Error('Timed out waiting for the receipt race advisory lock');
    }

    async function waitForPostgresLockWait(
        fixture: Fixture,
        processId: number,
        settled: () => boolean
    ): Promise<boolean> {
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
            if (settled()) return false;
            const activity = await fixture.database.prepare(
                `SELECT wait_event_type FROM pg_stat_activity WHERE pid=?`
            ).bind(processId).first<{ wait_event_type: string | null }>();
            if (activity?.wait_event_type === 'Lock') return true;
            await delay(10);
        }
        throw new Error('Timed out waiting for the account restriction lock');
    }

    function updateInput(
        officeId: string,
        ownerAccountId: string,
        expectedRevision: number,
        overrides: Record<string, unknown> = {}
    ) {
        return {
            officeId,
            ownerAccountId,
            name: 'Updated office',
            intro: 'Updated intro',
            city: 'Shanghai',
            address: '765 Producer Street',
            latitude: 31.2304,
            longitude: 121.4737,
            accent: '#4f64dd',
            isOpen: false,
            seriesCodes: ['cg', '765'],
            expectedRevision,
            updatedAt: UPDATED_AT,
            ...overrides
        };
    }

    async function assertOfficeManagement(fixture: Fixture): Promise<void> {
        const ownerId = `${fixture.dialect}-office-owner`;
        const otherId = `${fixture.dialect}-office-other`;
        const restrictedId = `${fixture.dialect}-office-restricted`;
        await seedAccount(fixture, ownerId);
        await seedAccount(fixture, otherId);
        await seedAccount(fixture, restrictedId, 'restricted');

        assert.deepEqual(await fixture.repository.createOfficeForOwner(office(
            `${fixture.dialect}-restricted-office`,
            restrictedId
        )), { status: 'unavailable' });

        await fixture.database.prepare(
            "UPDATE agencies SET wiki_enabled=FALSE WHERE code='876'"
        ).run();
        const disabled = office(`${fixture.dialect}-disabled-office`, ownerId, {
            seriesCodes: ['876']
        });
        assert.deepEqual(
            await fixture.repository.createOfficeForOwner(disabled),
            { status: 'unavailable' }
        );
        assert.equal(await fixture.database.prepare(
            `SELECT COUNT(*) AS count FROM fudaba_mutation_receipts
         WHERE account_id=? AND key_hash=?`
        ).bind(ownerId, disabled.idempotencyKeyHash).first<number>('count'), 0);
        assert.equal(await fixture.repository.findOfficeById(disabled.id), null);
        assert.equal(await countOrphanedOfficeCreateReceipts(fixture), 0);

        const untaggedOfficeId = `${fixture.dialect}-untagged-office`;
        const untagged = await fixture.repository.createOfficeForOwner(office(
            untaggedOfficeId,
            ownerId,
            { seriesCodes: [] }
        ));
        assert.equal(untagged.status, 'saved');
        if (untagged.status === 'saved') {
            assert.deepEqual(untagged.office.series_codes, []);
        }

        const officeId = `${fixture.dialect}-managed-office`;
        const create = office(officeId, ownerId, {
            seriesCodes: ['765', 'cg']
        });
        const created = await fixture.repository.createOfficeForOwner(create);
        assert.equal(created.status, 'saved');
        if (created.status !== 'saved') return;
        assert.equal(created.office.revision, 0);
        assert.equal(created.office.pending_cover_object_key, null);
        assert.deepEqual(created.office.series_codes, ['765', 'cg']);

        const replayed = await fixture.repository.createOfficeForOwner({
            ...create,
            id: `${officeId}-retry`,
            slug: `${officeId}-retry`
        });
        assert.equal(replayed.status, 'saved');
        if (replayed.status !== 'saved') return;
        assert.equal(replayed.office.id, officeId);
        assert.deepEqual(await fixture.repository.createOfficeForOwner({
            ...create,
            id: `${officeId}-conflict`,
            slug: `${officeId}-conflict`,
            requestHash: hash('different-request')
        }), { status: 'idempotency-conflict' });
        assert.equal(await countOrphanedOfficeCreateReceipts(fixture), 0);
        assert.equal(await fixture.repository.findOfficeForOwner(officeId, otherId), null);
        assert.deepEqual(await fixture.repository.updateOfficeForOwner(updateInput(
            officeId,
            otherId,
            0
        )), { status: 'unavailable' });

        await seedPendingLocation(fixture, officeId);
        const metadata = await fixture.repository.updateOfficeForOwner(updateInput(
            officeId,
            ownerId,
            0
        ));
        assert.equal(metadata.status, 'saved');
        if (metadata.status !== 'saved') return;
        assert.equal(metadata.office.revision, 1);
        assert.deepEqual(metadata.office.series_codes, ['cg', '765']);
        assert.ok(await fixture.repository.findOfficePublicLocationForOwner(
            officeId,
            ownerId
        ), 'unchanged exact location must retain review state');

        const relocated = await fixture.repository.updateOfficeForOwner(updateInput(
            officeId,
            ownerId,
            1,
            { city: 'Hangzhou', seriesCodes: [], updatedAt: LATER_AT }
        ));
        assert.equal(relocated.status, 'saved');
        assert.equal(await fixture.repository.findOfficePublicLocationForOwner(
            officeId,
            ownerId
        ), null, 'city or address changes must withdraw public location review');

        await fixture.database.prepare(
            "UPDATE agencies SET wiki_enabled=FALSE WHERE code='sidem'"
        ).run();
        assert.deepEqual(await fixture.repository.updateOfficeForOwner(updateInput(
            officeId,
            ownerId,
            2,
            { seriesCodes: ['sidem'], updatedAt: LATER_AT }
        )), { status: 'unavailable' });
        const afterRollback = await fixture.repository.findOfficeForOwner(officeId, ownerId);
        assert.equal(afterRollback?.revision, 2);
        assert.deepEqual(afterRollback?.series_codes, []);
        await fixture.database.prepare(
            "UPDATE agencies SET wiki_enabled=TRUE WHERE code='sidem'"
        ).run();

        const sibling = new SqlFudabaRepository(
            fixture.database,
            initializedPostgresSchema
        );
        await sibling.initialize();
        const first = updateInput(officeId, ownerId, 2, {
            name: 'First writer',
            seriesCodes: ['765'],
            updatedAt: LATER_AT
        });
        const second = updateInput(officeId, ownerId, 2, {
            name: 'Second writer',
            seriesCodes: ['cg', 'sidem'],
            updatedAt: LATER_AT
        });
        const casResults = await Promise.all([
            fixture.repository.updateOfficeForOwner(first),
            sibling.updateOfficeForOwner(second)
        ]);
        assert.deepEqual(
            casResults.map((result) => result.status).sort(),
            ['conflict', 'saved']
        );
        const afterCas = await fixture.repository.findOfficeForOwner(officeId, ownerId);
        assert.equal(afterCas?.revision, 3);
        if (afterCas?.name === 'First writer') {
            assert.deepEqual(afterCas.series_codes, ['765']);
        } else {
            assert.equal(afterCas?.name, 'Second writer');
            assert.deepEqual(afterCas?.series_codes, ['cg', 'sidem']);
        }

        const pendingKey = `community/fudaba/offices/${officeId}/covers/pending.webp`;
        const reserved = await fixture.repository.reservePendingOfficeCoverForOwner({
            officeId,
            ownerAccountId: ownerId,
            objectKey: pendingKey,
            expectedRevision: 3,
            submittedAt: LATER_AT
        });
        assert.equal(reserved.status, 'saved');
        assert.deepEqual(await fixture.repository.reservePendingOfficeCoverForOwner({
            officeId,
            ownerAccountId: ownerId,
            objectKey: `${pendingKey}.second`,
            expectedRevision: 4,
            submittedAt: LATER_AT
        }), { status: 'pending-exists', revision: 4 });
        await fixture.database.prepare(
            `UPDATE platform_accounts
         SET status='restricted', updated_at=1700000000001
         WHERE id=?`
        ).bind(ownerId).run();
        assert.deepEqual(await fixture.repository.clearPendingOfficeCoverForOwner({
            officeId,
            ownerAccountId: ownerId,
            objectKey: `${pendingKey}.wrong`,
            expectedRevision: 4,
            updatedAt: LATER_AT
        }), { status: 'unavailable' });
        assert.deepEqual(await fixture.repository.clearPendingOfficeCoverForOwner({
            officeId,
            ownerAccountId: ownerId,
            objectKey: pendingKey,
            expectedRevision: 3,
            updatedAt: LATER_AT
        }), { status: 'conflict', revision: 4 });
        const cleared = await fixture.repository.clearPendingOfficeCoverForOwner({
            officeId,
            ownerAccountId: ownerId,
            objectKey: pendingKey,
            expectedRevision: 4,
            updatedAt: LATER_AT
        });
        assert.equal(cleared.status, 'saved');
        if (cleared.status !== 'saved') return;
        assert.equal(cleared.previousPendingObjectKey, pendingKey);
        assert.equal(cleared.office.pending_cover_object_key, null);
        await fixture.database.prepare(
            `UPDATE platform_accounts
         SET status='active', deleted_at=NULL, updated_at=1700000000002
         WHERE id=?`
        ).bind(ownerId).run();

        await fixture.database.prepare(
            "UPDATE fudaba_offices SET status='hidden' WHERE id=?"
        ).bind(officeId).run();
        for (const result of [
            await fixture.repository.updateOfficeForOwner(updateInput(
                officeId,
                ownerId,
                5
            )),
            await fixture.repository.reservePendingOfficeCoverForOwner({
                officeId,
                ownerAccountId: ownerId,
                objectKey: `${pendingKey}.hidden`,
                expectedRevision: 5,
                submittedAt: LATER_AT
            }),
            await fixture.repository.archiveOfficeForOwner({
                officeId,
                ownerAccountId: ownerId,
                expectedRevision: 5,
                archivedAt: LATER_AT
            }),
            await fixture.repository.restoreOfficeForOwner({
                officeId,
                ownerAccountId: ownerId,
                expectedRevision: 5,
                restoredAt: LATER_AT
            })
        ]) {
            assert.deepEqual(result, {
                status: 'state-conflict',
                revision: 5,
                officeStatus: 'hidden'
            });
        }
        await fixture.database.prepare(
            "UPDATE fudaba_offices SET status='active' WHERE id=?"
        ).bind(officeId).run();
        const archived = await fixture.repository.archiveOfficeForOwner({
            officeId,
            ownerAccountId: ownerId,
            expectedRevision: 5,
            archivedAt: LATER_AT
        });
        assert.equal(archived.status, 'saved');
        assert.deepEqual(await fixture.repository.reservePendingOfficeCoverForOwner({
            officeId,
            ownerAccountId: ownerId,
            objectKey: `${pendingKey}.archived`,
            expectedRevision: 6,
            submittedAt: LATER_AT
        }), {
            status: 'state-conflict',
            revision: 6,
            officeStatus: 'archived'
        });
        const restored = await fixture.repository.restoreOfficeForOwner({
            officeId,
            ownerAccountId: ownerId,
            expectedRevision: 6,
            restoredAt: LATER_AT
        });
        assert.equal(restored.status, 'saved');
        const deletedPendingKey = `${pendingKey}.deleted-owner`;
        const reservedBeforeDeletion =
            await fixture.repository.reservePendingOfficeCoverForOwner({
                officeId,
                ownerAccountId: ownerId,
                objectKey: deletedPendingKey,
                expectedRevision: 7,
                submittedAt: LATER_AT
            });
        assert.equal(reservedBeforeDeletion.status, 'saved');
        await fixture.database.prepare(
            `UPDATE platform_accounts
         SET status='deleted', deleted_at=1700000000003,
             updated_at=1700000000003
         WHERE id=?`
        ).bind(ownerId).run();
        const clearedAfterDeletion =
            await fixture.repository.clearPendingOfficeCoverForOwner({
                officeId,
                ownerAccountId: ownerId,
                objectKey: deletedPendingKey,
                expectedRevision: 8,
                updatedAt: LATER_AT
            });
        assert.equal(clearedAfterDeletion.status, 'saved');
        if (clearedAfterDeletion.status === 'saved') {
            assert.equal(clearedAfterDeletion.office.revision, 9);
            assert.equal(clearedAfterDeletion.office.pending_cover_object_key, null);
        }
        assert.deepEqual(
            (await fixture.repository.listOfficesForOwner(ownerId)).map(({ id }) => id),
            [officeId, untaggedOfficeId]
        );
    }

    describe('Fudaba office management repository', () => {
        postgresTest('real PostgreSQL owner offices enforce receipt and cross-replica CAS', async () => {
            await assertOfficeManagement(await createFixture('postgresql'));
        });

        async function assertOwnerOfficeReadsUseOneSnapshot(fixture: Fixture): Promise<void> {
            const ownerId = `${fixture.dialect}-snapshot-owner`;
            const officeId = `${fixture.dialect}-snapshot-office`;
            await seedAccount(fixture, ownerId);
            const created = await fixture.repository.createOfficeForOwner(office(
                officeId,
                ownerId,
                { name: 'Version zero', seriesCodes: ['765'] }
            ));
            assert.equal(created.status, 'saved');

            let firstInterleaved = false;
            const firstReader = new SqlFudabaRepository(
                new InterleavingOwnerReadDatabase(fixture.database, async () => {
                    firstInterleaved = true;
                    const updated = await fixture.repository.updateOfficeForOwner(updateInput(
                        officeId,
                        ownerId,
                        0,
                        { name: 'Version one', seriesCodes: ['cg'] }
                    ));
                    assert.equal(updated.status, 'saved');
                }),
                initializedPostgresSchema
            );
            await firstReader.initialize();
            const firstSnapshot = await firstReader.findOfficeForOwner(officeId, ownerId);
            assert.equal(firstInterleaved, true);
            assert.deepEqual(
                [firstSnapshot?.revision, firstSnapshot?.name, firstSnapshot?.series_codes],
                [0, 'Version zero', ['765']]
            );

            let secondInterleaved = false;
            const secondReader = new SqlFudabaRepository(
                new InterleavingOwnerReadDatabase(fixture.database, async () => {
                    secondInterleaved = true;
                    const updated = await fixture.repository.updateOfficeForOwner(updateInput(
                        officeId,
                        ownerId,
                        1,
                        { name: 'Version two', seriesCodes: ['sidem'] }
                    ));
                    assert.equal(updated.status, 'saved');
                }),
                initializedPostgresSchema
            );
            await secondReader.initialize();
            const listedSnapshot = (await secondReader.listOfficesForOwner(ownerId))[0];
            assert.equal(secondInterleaved, true);
            assert.deepEqual(
                [listedSnapshot?.revision, listedSnapshot?.name, listedSnapshot?.series_codes],
                [1, 'Version one', ['cg']]
            );
            const current = await fixture.repository.findOfficeForOwner(officeId, ownerId);
            assert.deepEqual(
                [current?.revision, current?.name, current?.series_codes],
                [2, 'Version two', ['sidem']]
            );
        }

        postgresTest('real PostgreSQL owner reads keep metadata and series in one snapshot', async () => {
            await assertOwnerOfficeReadsUseOneSnapshot(await createFixture('postgresql'));
        });

        postgresTest('real PostgreSQL owner lock keeps office-create receipts atomic', async () => {
            const fixture = await createFixture('postgresql');
            const ownerId = 'postgresql-receipt-race-owner';
            const officeId = 'postgresql-receipt-race-office';
            const createInput = office(officeId, ownerId);
            await seedAccount(fixture, ownerId);
            await fixture.database.executeScript(`
        CREATE FUNCTION public.fudaba_test_hold_office_create_receipt()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            PERFORM pg_advisory_xact_lock(
                ${RECEIPT_RACE_LOCK[0]}, ${RECEIPT_RACE_LOCK[1]}
            );
            RETURN NEW;
        END;
        $$;

        CREATE TRIGGER fudaba_test_hold_office_create_receipt
        AFTER INSERT ON public.fudaba_mutation_receipts
        FOR EACH ROW
        EXECUTE FUNCTION public.fudaba_test_hold_office_create_receipt();
    `);

            const postgres = fixture.database as PostgresConnection;
            const controller = await postgres.pool.connect();
            const updater = await postgres.pool.connect();
            const updaterProcessId = Number((await updater.query(
                'SELECT pg_backend_pid() AS pid'
            )).rows[0]?.pid);
            let controllerLocked = false;
            let restrictionAttempt: Promise<unknown> | undefined;
            await controller.query(
                'SELECT pg_advisory_lock($1, $2)',
                [...RECEIPT_RACE_LOCK]
            );
            controllerLocked = true;
            const createAttempt = fixture.repository.createOfficeForOwner(createInput);
            try {
                await waitForAdvisoryLockWaiter(fixture);
                let restrictionSettled = false;
                restrictionAttempt = updater.query(
                    `UPDATE platform_accounts
             SET status='restricted', updated_at=1700000000001
             WHERE id=$1`,
                    [ownerId]
                ).finally(() => {
                    restrictionSettled = true;
                });
                const restrictionWasBlocked = await waitForPostgresLockWait(
                    fixture,
                    updaterProcessId,
                    () => restrictionSettled
                );
                await controller.query(
                    'SELECT pg_advisory_unlock($1, $2)',
                    [...RECEIPT_RACE_LOCK]
                );
                controllerLocked = false;

                const [created] = await Promise.all([createAttempt, restrictionAttempt]);
                assert.equal(
                    restrictionWasBlocked,
                    true,
                    'account restriction must wait for receipt and office to commit'
                );
                assert.equal(created.status, 'saved');
                assert.ok(await fixture.repository.findOfficeForOwner(officeId, ownerId));
                assert.equal(await fixture.database.prepare(
                    `SELECT COUNT(*) AS count FROM fudaba_mutation_receipts
             WHERE scope='office-create' AND account_id=? AND key_hash=?
               AND resource_id=?`
                ).bind(
                    ownerId,
                    createInput.idempotencyKeyHash,
                    officeId
                ).first<number>('count'), 1);
                assert.equal(await countOrphanedOfficeCreateReceipts(fixture), 0);
            } finally {
                if (controllerLocked) {
                    await controller.query(
                        'SELECT pg_advisory_unlock($1, $2)',
                        [...RECEIPT_RACE_LOCK]
                    ).catch(() => undefined);
                }
                await Promise.allSettled([
                    createAttempt,
                    ...(restrictionAttempt ? [restrictionAttempt] : [])
                ]);
                updater.release();
                controller.release();
            }
        });
    });
}

// fudaba-office-management-routes.test.ts
{
    const ACCOUNT_ID = 'office-owner';
    const OTHER_ACCOUNT_ID = 'other-owner';
    const PLATFORM_TOKEN = 'office-platform-token';
    const CSRF_SECRET = 'office-csrf-secret';
    const CREATED_AT = '2026-08-03T01:00:00.000Z';
    const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);

    function officeRecord(
        overrides: Partial<FudabaOwnerOfficeRecord> = {}
    ): FudabaOwnerOfficeRecord {
        return {
            id: 'owner-office',
            owner_account_id: ACCOUNT_ID,
            slug: 'owner-office',
            name: 'Owner Office',
            intro: 'Owner intro',
            city: 'Shanghai',
            address: 'Private exact address',
            latitude: 31.2304,
            longitude: 121.4737,
            accent: '#ef5b6c',
            cover_object_key: 'protected/fudaba/offices/owner-office/cover.webp',
            pending_cover_object_key: null,
            pending_cover_submitted_at: null,
            is_open: true,
            visitor_count: 8,
            status: 'active',
            revision: 0,
            created_at: CREATED_AT,
            updated_at: CREATED_AT,
            archived_at: null,
            series_codes: ['765'],
            ...overrides
        };
    }

    function officeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            name: 'New Office',
            intro: 'Office intro',
            city: 'Shanghai',
            address: '765 Producer Street',
            latitude: 31.2304,
            longitude: 121.4737,
            accent: '#ef5b6c',
            isOpen: true,
            seriesCodes: ['765'],
            ...overrides
        };
    }

    function uploadedFile(): UploadedFile {
        return { filename: 'cover.jpg', contentType: 'image/jpeg', body: JPEG_BYTES };
    }

    class ControlledUploads implements UploadParser {
        next: ParsedUpload = {
            fields: { expectedRevision: '0' },
            files: { image: uploadedFile() }
        };
        readonly calls: Array<Parameters<UploadParser['parse']>[1]> = [];

        async parse(
            _request: Request,
            options: Parameters<UploadParser['parse']>[1]
        ): Promise<ParsedUpload> {
            this.calls.push(options);
            return this.next;
        }
    }

    class CoverImages implements ImageProcessor {
        async validate(body: Uint8Array, declaredType?: string): Promise<ImageInfo> {
            if (body[0] === 0xff) {
                return {
                    format: 'jpeg', width: 1200, height: 800,
                    contentType: 'image/jpeg'
                };
            }
            if (body[0] === 0x52 && declaredType === 'image/webp') {
                return {
                    format: 'webp', width: 1200, height: 800,
                    contentType: 'image/webp'
                };
            }
            throw new Error('unexpected image');
        }

        async toWebp(): Promise<Uint8Array> {
            return new Uint8Array([0x52, 0x49, 0x46, 0x46]);
        }

        async thumbnailPng(): Promise<Uint8Array> {
            throw new Error('unused');
        }

        async resizeJpeg(): Promise<Uint8Array> {
            throw new Error('unused');
        }
    }

    class CoverStorage {
        readonly objects = new Map<string, { stored: StoredObject; options: PutObjectOptions }>();
        readonly puts: Array<{ key: string; options: PutObjectOptions }> = [];
        readonly deletes: string[] = [];
        readonly ownedDeletes: Array<{ key: string; ownerToken: string }> = [];
        readonly reads: Array<{ key: string; method?: 'GET' | 'HEAD' }> = [];
        readonly events: string[] = [];
        failPut = false;
        failPutAfterStore = false;
        afterPut: (() => void | Promise<void>) | null = null;

        seed(key: string): void {
            this.objects.set(key, {
                stored: {
                    body: new Uint8Array([0x52]),
                    size: 1,
                    contentType: 'image/webp',
                    etag: `seed-${key}`
                },
                options: { protectedAccess: true }
            });
        }

        async get(key: string): Promise<StoredObject | null> {
            return this.objects.get(key)?.stored ?? null;
        }

        async createReadUrl(key: string, options?: { method?: 'GET' | 'HEAD' }) {
            this.reads.push({ key, method: options?.method });
            return this.objects.has(key)
                ? {
                    url: `https://private.example.test/${encodeURIComponent(key)}`,
                    visibility: 'private' as const
                }
                : null;
        }

        async put(
            key: string,
            body: Uint8Array,
            options: PutObjectOptions = {}
        ): Promise<StoredObject> {
            this.events.push('put');
            this.puts.push({ key, options });
            if (this.failPut) throw new Error('injected cover put failure');
            const stored = {
                body,
                size: body.byteLength,
                contentType: options.contentType ?? 'application/octet-stream',
                etag: `etag-${this.puts.length}`
            };
            this.objects.set(key, { stored, options });
            await this.afterPut?.();
            if (this.failPutAfterStore) {
                throw new Error('injected uncertain cover put failure');
            }
            return stored;
        }

        async delete(key: string): Promise<void> {
            this.events.push('delete');
            this.deletes.push(key);
            this.objects.delete(key);
        }

        async deleteIfOwned(key: string, ownerToken: string): Promise<boolean> {
            this.events.push('owned-delete');
            this.ownedDeletes.push({ key, ownerToken });
            const current = this.objects.get(key);
            if (current?.options.ownerToken !== ownerToken) return false;
            this.objects.delete(key);
            return true;
        }

        async exists(key: string): Promise<boolean> {
            return this.objects.has(key);
        }

        async copy(): Promise<void> { throw new Error('unused'); }
        async move(): Promise<void> { throw new Error('unused'); }
        async list(): Promise<[]> { return []; }
        async deletePrefix(): Promise<void> {}
    }

    class ControlledRateLimiter implements RateLimiter {
        readonly deniedBuckets = new Set<string>();
        readonly calls: string[] = [];

        async consume(
            bucket: string,
            _key: string,
            limit: number
        ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
            this.calls.push(bucket);
            const allowed = !this.deniedBuckets.has(bucket);
            return {
                allowed,
                remaining: allowed ? limit - 1 : 0,
                resetAt: Date.now() + 60_000
            };
        }
    }

    class OfficeRouteFixture {
        accountStatus: PlatformAccountStatus = 'active';
        writeEnabled = true;
        readonly offices = new Map<string, FudabaOwnerOfficeRecord>();
        readonly receipts = new Map<string, { requestHash: string; officeId: string }>();
        readonly uploads = new ControlledUploads();
        readonly images = new CoverImages();
        readonly storage = new CoverStorage();
        readonly rateLimiter = new ControlledRateLimiter();
        readonly createInputs: CreateOwnedFudabaOfficeInput[] = [];
        readonly updateInputs: UpdateOwnedFudabaOfficeInput[] = [];
        readonly events = this.storage.events;
        reserveMode: 'saved' | 'mutate-then-throw' = 'saved';
        clearMode: 'saved' | 'unavailable' | 'throw' | 'promote' = 'saved';
        clearAttempts = 0;
        failOwnerReadAfterPut = false;
        readonly app: ReturnType<typeof createHonoApp>;
        readonly session = {
            id: 'office-session',
            account_id: ACCOUNT_ID,
            token_hash: 'refresh-hash',
            previous_token_hash: null,
            csrf_hash: csrfHash(CSRF_SECRET),
            expires_at: Date.now() + 3_600_000,
            created_at: Date.now(),
            updated_at: Date.now(),
            revoked_at: null
        };

        constructor() {
            const owner = officeRecord();
            const other = officeRecord({
                id: 'other-office',
                owner_account_id: OTHER_ACCOUNT_ID,
                slug: 'other-office',
                cover_object_key: 'protected/fudaba/offices/other-office/cover.webp'
            });
            this.offices.set(owner.id, owner);
            this.offices.set(other.id, other);
            this.storage.seed(owner.cover_object_key!);
            this.storage.seed(other.cover_object_key!);
            this.app = createHonoApp(() => this.runtime());
        }

        private ownerOffice(officeId: string, ownerAccountId: string) {
            const office = this.offices.get(officeId);
            return office?.owner_account_id === ownerAccountId ? office : null;
        }

        private saved(office: FudabaOwnerOfficeRecord): FudabaOfficeMutationResult {
            return { status: 'saved', office: { ...office }, previousPendingObjectKey: null };
        }

        readonly fudaba = {
            listOfficesForOwner: async (ownerAccountId: string) =>
                [...this.offices.values()]
                    .filter((office) => office.owner_account_id === ownerAccountId)
                    .map((office) => ({ ...office })),
            findOfficeForOwner: async (officeId: string, ownerAccountId: string) => {
                if (this.failOwnerReadAfterPut && this.storage.puts.length > 0) {
                    throw new Error('injected owner office confirmation failure');
                }
                const office = this.ownerOffice(officeId, ownerAccountId);
                return office ? { ...office } : null;
            },
            createOfficeForOwner: async (
                input: CreateOwnedFudabaOfficeInput
            ): Promise<FudabaOfficeCreateResult> => {
                this.createInputs.push(input);
                const receipt = this.receipts.get(input.idempotencyKeyHash);
                if (receipt) {
                    if (receipt.requestHash !== input.requestHash) {
                        return { status: 'idempotency-conflict' };
                    }
                    return this.saved(this.offices.get(receipt.officeId)!);
                }
                const created = officeRecord({
                    id: input.id,
                    owner_account_id: input.ownerAccountId,
                    slug: input.slug,
                    name: input.name,
                    intro: input.intro,
                    city: input.city,
                    address: input.address,
                    latitude: input.latitude,
                    longitude: input.longitude,
                    accent: input.accent,
                    cover_object_key: null,
                    visitor_count: 0,
                    is_open: input.isOpen,
                    status: 'active',
                    revision: 0,
                    created_at: input.createdAt,
                    updated_at: input.updatedAt,
                    archived_at: null,
                    series_codes: input.seriesCodes
                });
                this.offices.set(created.id, created);
                this.receipts.set(input.idempotencyKeyHash, {
                    requestHash: input.requestHash,
                    officeId: created.id
                });
                return this.saved(created);
            },
            updateOfficeForOwner: async (
                input: UpdateOwnedFudabaOfficeInput
            ): Promise<FudabaOfficeMutationResult> => {
                this.updateInputs.push(input);
                const current = this.ownerOffice(input.officeId, input.ownerAccountId);
                if (!current) return { status: 'unavailable' };
                if (current.revision !== input.expectedRevision) {
                    return { status: 'conflict', revision: current.revision };
                }
                if (current.status !== 'active') {
                    return {
                        status: 'state-conflict', revision: current.revision,
                        officeStatus: current.status
                    };
                }
                Object.assign(current, {
                    name: input.name,
                    intro: input.intro,
                    city: input.city,
                    address: input.address,
                    latitude: input.latitude,
                    longitude: input.longitude,
                    accent: input.accent,
                    is_open: input.isOpen,
                    series_codes: input.seriesCodes,
                    revision: current.revision + 1,
                    updated_at: input.updatedAt
                });
                return this.saved(current);
            },
            archiveOfficeForOwner: async (input: {
                officeId: string; ownerAccountId: string;
                expectedRevision: number; archivedAt: string;
            }): Promise<FudabaOfficeMutationResult> => {
                const current = this.ownerOffice(input.officeId, input.ownerAccountId);
                if (!current) return { status: 'unavailable' };
                if (current.revision !== input.expectedRevision) {
                    return { status: 'conflict', revision: current.revision };
                }
                if (current.status !== 'active') {
                    return {
                        status: 'state-conflict', revision: current.revision,
                        officeStatus: current.status
                    };
                }
                Object.assign(current, {
                    status: 'archived', archived_at: input.archivedAt,
                    updated_at: input.archivedAt, revision: current.revision + 1
                });
                return this.saved(current);
            },
            restoreOfficeForOwner: async (input: {
                officeId: string; ownerAccountId: string;
                expectedRevision: number; restoredAt: string;
            }): Promise<FudabaOfficeMutationResult> => {
                const current = this.ownerOffice(input.officeId, input.ownerAccountId);
                if (!current) return { status: 'unavailable' };
                if (current.revision !== input.expectedRevision) {
                    return { status: 'conflict', revision: current.revision };
                }
                if (current.status !== 'archived') {
                    return {
                        status: 'state-conflict', revision: current.revision,
                        officeStatus: current.status
                    };
                }
                Object.assign(current, {
                    status: 'active', archived_at: null,
                    updated_at: input.restoredAt, revision: current.revision + 1
                });
                return this.saved(current);
            },
            reservePendingOfficeCoverForOwner: async (input: {
                officeId: string; ownerAccountId: string; objectKey: string;
                expectedRevision: number; submittedAt: string;
            }): Promise<FudabaOfficeMutationResult> => {
                const current = this.ownerOffice(input.officeId, input.ownerAccountId);
                if (!current) return { status: 'unavailable' };
                if (current.revision !== input.expectedRevision) {
                    return { status: 'conflict', revision: current.revision };
                }
                if (current.status !== 'active') {
                    return {
                        status: 'state-conflict', revision: current.revision,
                        officeStatus: current.status
                    };
                }
                if (current.pending_cover_object_key) {
                    return { status: 'pending-exists', revision: current.revision };
                }
                this.events.push('reserve');
                Object.assign(current, {
                    pending_cover_object_key: input.objectKey,
                    pending_cover_submitted_at: input.submittedAt,
                    updated_at: input.submittedAt,
                    revision: current.revision + 1
                });
                if (this.reserveMode === 'mutate-then-throw') {
                    throw new Error('connection lost after reserve');
                }
                return this.saved(current);
            },
            clearPendingOfficeCoverForOwner: async (input: {
                officeId: string; ownerAccountId: string; objectKey: string;
                expectedRevision: number; updatedAt: string;
            }): Promise<FudabaOfficeMutationResult> => {
                this.clearAttempts += 1;
                const current = this.ownerOffice(input.officeId, input.ownerAccountId);
                if (!current) return { status: 'unavailable' };
                if (this.clearMode === 'throw') {
                    throw new Error('injected cover release failure');
                }
                if (this.clearMode === 'unavailable') return { status: 'unavailable' };
                if (this.clearMode === 'promote') {
                    Object.assign(current, {
                        cover_object_key: input.objectKey,
                        pending_cover_object_key: null,
                        pending_cover_submitted_at: null,
                        revision: current.revision + 1,
                        updated_at: input.updatedAt
                    });
                    return { status: 'unavailable' };
                }
                if (current.revision !== input.expectedRevision) {
                    return { status: 'conflict', revision: current.revision };
                }
                if (current.pending_cover_object_key !== input.objectKey) {
                    return {
                        status: 'state-conflict', revision: current.revision,
                        officeStatus: current.status
                    };
                }
                this.events.push('release');
                Object.assign(current, {
                    pending_cover_object_key: null,
                    pending_cover_submitted_at: null,
                    updated_at: input.updatedAt,
                    revision: current.revision + 1
                });
                return {
                    status: 'saved',
                    office: { ...current },
                    previousPendingObjectKey: input.objectKey
                };
            }
        } as unknown as FudabaRepository;

        runtime(): RuntimeServices {
            return {
                fudaba: this.fudaba,
                uploads: this.uploads,
                images: this.images,
                storage: this.storage as unknown as ObjectStorage,
                compensation: {
                    enqueue: async () => 'compensation',
                    run: async () => undefined
                },
                rateLimiter: this.rateLimiter,
                platformAccounts: {
                    findRefreshSessionById: async (id: string) =>
                        id === this.session.id ? { ...this.session } : null,
                    findAccountWithProfileById: async (id: string) => id === ACCOUNT_ID
                        ? {
                            account: {
                                id: ACCOUNT_ID,
                                status: this.accountStatus,
                                token_version: 0,
                                created_at: 500,
                                updated_at: 500,
                                deleted_at: null
                            },
                            profile: {
                                account_id: ACCOUNT_ID,
                                display_name: 'Office Owner',
                                avatar_object_key: null,
                                avatar_external_url: null,
                                home_city: 'Shanghai',
                                bio: '',
                                updated_at: 500
                            }
                        }
                        : null,
                    revokeRefreshSession: async () => true
                } as unknown as NonNullable<RuntimeServices['platformAccounts']>,
                platformTokens: {
                    async sign() { return PLATFORM_TOKEN; },
                    async verify(token: string) {
                        if (token !== PLATFORM_TOKEN) throw new Error('wrong token');
                        const now = Math.floor(Date.now() / 1000);
                        return {
                            iss: 'imsweb' as const,
                            aud: 'ims-platform' as const,
                            kind: 'platform' as const,
                            id: ACCOUNT_ID,
                            tokenVersion: 0,
                            sessionId: 'office-session',
                            csrfSecret: CSRF_SECRET,
                            jti: 'office-access',
                            iat: now,
                            exp: now + 900
                        };
                    }
                },
                config: {
                    fudabaPublicReadEnabled: false,
                    fudabaWriteEnabled: this.writeEnabled
                }
            };
        }
    }

    function bearerHeaders(extra: Record<string, string> = {}): Record<string, string> {
        return bearerTokenHeaders(PLATFORM_TOKEN, extra);
    }

    async function createOffice(
        fixture: OfficeRouteFixture,
        key: string,
        body = officeBody()
    ): Promise<Response> {
        return fixture.app.request('http://ims.test/api/community/exchange/offices', {
            method: 'POST',
            headers: bearerHeaders({
                'content-type': 'application/json',
                'idempotency-key': key
            }),
            body: JSON.stringify(body)
        });
    }

    async function uploadCover(
        fixture: OfficeRouteFixture,
        officeId = 'owner-office'
    ): Promise<Response> {
        return fixture.app.request(
            `http://ims.test/api/community/exchange/me/offices/${officeId}/cover`,
            { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
        );
    }

    test.describe('Fudaba office management routes', () => {
        test('owner office reads ignore public/write flags and never expose object keys', async () => {
            const fixture = new OfficeRouteFixture();
            fixture.writeEnabled = false;
            const list = await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices',
                { headers: bearerHeaders() }
            );
            assert.equal(list.status, 200);
            const serialized = JSON.stringify(
                await contractJson(list, fudabaOwnerOfficeListSchema)
            );
            assert.equal(serialized.includes('object_key'), false);
            assert.equal(serialized.includes('protected/fudaba'), false);
            assert.match(serialized, /media\/cover/);
            assert.equal((await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices/other-office',
                { headers: bearerHeaders() }
            )).status, 404);
            assert.equal((await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices'
            )).status, 401);
        });

        test('office creation requires persistent idempotency and replays one resource', async () => {
            const fixture = new OfficeRouteFixture();
            const missingKey = await fixture.app.request(
                'http://ims.test/api/community/exchange/offices',
                {
                    method: 'POST',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify(officeBody())
                }
            );
            assert.equal(missingKey.status, 400);
            assert.equal(fixture.createInputs.length, 0);

            const untaggedBody = officeBody({ seriesCodes: [] });
            const created = await createOffice(fixture, 'create-office-key', untaggedBody);
            assert.equal(created.status, 201);
            const createdBody = await contractJson(created, fudabaOfficeMutationResponseSchema);
            assert.ok(createdBody.office?.id);
            assert.equal(fixture.createInputs[0]?.status, 'active');
            assert.equal(fixture.createInputs[0]?.revision, 0);
            assert.equal(fixture.createInputs[0]?.visitorCount, 0);
            assert.equal(fixture.createInputs[0]?.coverObjectKey, null);
            assert.deepEqual(fixture.createInputs[0]?.seriesCodes, []);
            assert.match(fixture.createInputs[0]?.idempotencyKeyHash ?? '', /^[0-9a-f]{64}$/);
            assert.match(fixture.createInputs[0]?.requestHash ?? '', /^[0-9a-f]{64}$/);

            const replay = await createOffice(fixture, 'create-office-key', untaggedBody);
            assert.equal(replay.status, 201);
            assert.equal(
                (await contractJson(replay, fudabaOfficeMutationResponseSchema)).office.id,
                createdBody.office.id
            );
            const conflict = await createOffice(
                fixture,
                'create-office-key',
                officeBody({ name: 'Different office' })
            );
            assert.equal(conflict.status, 409);
            assert.equal(
                (await contractJson(conflict, fudabaErrorResponseSchema) as { code: string }).code,
                'FUDABA_IDEMPOTENCY_CONFLICT'
            );

            const forbidden = await createOffice(
                fixture,
                'unknown-field',
                officeBody({ status: 'hidden' })
            );
            assert.equal(forbidden.status, 400);
            await contractJson(forbidden, fudabaErrorResponseSchema);
            const tooManyTags = await createOffice(
                fixture,
                'too-many-tags',
                officeBody({
                    seriesCodes: ['765', '876', 'cg', 'ml', 'sc', 'sidem', 'va', 'gk', 'extra']
                })
            );
            assert.equal(tooManyTags.status, 400);
        });

        test('metadata and status routes fence stale, hidden, and non-owner writes', async () => {
            const fixture = new OfficeRouteFixture();
            const stale = await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices/owner-office',
                {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ ...officeBody(), expectedRevision: 9 })
                }
            );
            assert.equal(stale.status, 409);
            assert.equal((await stale.json() as { revision: number }).revision, 0);
            assert.equal((await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices/other-office',
                {
                    method: 'DELETE',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ expectedRevision: 0 })
                }
            )).status, 404);

            const hidden = fixture.offices.get('owner-office')!;
            hidden.status = 'hidden';
            const hiddenMetadata = await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices/owner-office',
                {
                    method: 'PUT',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ ...officeBody(), expectedRevision: 0 })
                }
            );
            assert.equal(hiddenMetadata.status, 409);
            assert.equal(
                (await hiddenMetadata.json() as { code: string }).code,
                'FUDABA_OFFICE_STATE_CONFLICT'
            );
            for (const [method, suffix] of [
                ['DELETE', ''],
                ['POST', '/restore']
            ] as const) {
                const response = await fixture.app.request(
                    `http://ims.test/api/community/exchange/me/offices/owner-office${suffix}`,
                    {
                        method,
                        headers: bearerHeaders({ 'content-type': 'application/json' }),
                        body: JSON.stringify({ expectedRevision: 0 })
                    }
                );
                assert.equal(response.status, 409);
                assert.equal((await response.json() as { officeStatus: string }).officeStatus,
                    'hidden');
            }
        });

        test('cover upload is active-only, reserves before put, and serves private previews', async () => {
            for (const status of ['hidden', 'archived'] as const) {
                const rejected = new OfficeRouteFixture();
                rejected.offices.get('owner-office')!.status = status;
                const response = await uploadCover(rejected);
                assert.equal(response.status, 409, status);
                assert.equal(rejected.uploads.calls.length, 0, status);
                assert.equal(rejected.storage.puts.length, 0, status);
            }
            const pending = new OfficeRouteFixture();
            pending.offices.get('owner-office')!.pending_cover_object_key = 'already-pending';
            assert.equal((await uploadCover(pending)).status, 409);
            assert.equal(pending.uploads.calls.length, 0);

            const fixture = new OfficeRouteFixture();
            const uploaded = await uploadCover(fixture);
            const body = await uploaded.json();
            assert.equal(uploaded.status, 202, JSON.stringify(body));
            assert.deepEqual(fixture.events.slice(0, 2), ['reserve', 'put']);
            assert.deepEqual(fixture.uploads.calls[0], {
                maxBytes: (8 * 1024 * 1024) + (64 * 1024),
                fileFields: ['image'],
                maxFiles: 1,
                maxFields: 1,
                maxParts: 2
            });
            const put = fixture.storage.puts[0]!;
            assert.match(put.key, /^community\/fudaba\/offices\/owner-office\/covers\/.+\.webp$/);
            assert.equal(put.options.contentType, 'image/webp');
            assert.equal(put.options.protectedAccess, true);
            assert.match(put.options.ownerToken ?? '', /^[0-9a-f]{64}$/);
            assert.equal(JSON.stringify(body).includes(put.key), false);
            assert.equal(JSON.stringify(body).includes('object_key'), false);

            const preview = await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices/owner-office/media/pending-cover?v=1',
                { headers: bearerHeaders(), redirect: 'manual' }
            );
            assert.equal(preview.status, 307);
            assert.equal(preview.headers.get('cache-control'), 'private, no-store');
            const head = await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices/owner-office/media/pending-cover?v=1',
                { method: 'HEAD', headers: bearerHeaders(), redirect: 'manual' }
            );
            assert.equal(head.status, 307);
            assert.equal(fixture.storage.reads.at(-1)?.method, 'HEAD');

            const withdrawn = await fixture.app.request(
                'http://ims.test/api/community/exchange/me/offices/owner-office/cover/pending',
                {
                    method: 'DELETE',
                    headers: bearerHeaders({ 'content-type': 'application/json' }),
                    body: JSON.stringify({ expectedRevision: 1 })
                }
            );
            assert.equal(withdrawn.status, 200);
            assert.equal(fixture.offices.get('owner-office')?.pending_cover_object_key, null);
            assert.equal(fixture.storage.objects.has(put.key), false);
        });

        test('cover failures release the reservation and uncertain commits reconcile', async () => {
            const failed = new OfficeRouteFixture();
            failed.storage.failPut = true;
            const response = await uploadCover(failed);
            assert.equal(response.status, 500);
            assert.deepEqual(failed.events.slice(0, 4), [
                'reserve', 'put', 'release', 'owned-delete'
            ]);
            assert.equal(failed.offices.get('owner-office')?.pending_cover_object_key, null);
            assert.equal(failed.storage.ownedDeletes.length, 1);

            const uncertain = new OfficeRouteFixture();
            uncertain.reserveMode = 'mutate-then-throw';
            const recovered = await uploadCover(uncertain);
            assert.equal(recovered.status, 202);
            assert.deepEqual(uncertain.events.slice(0, 2), ['reserve', 'put']);
            assert.equal(uncertain.storage.ownedDeletes.length, 0);
        });

        test('cover cleanup preserves objects while the database still or possibly references them',
            async () => {
                for (const clearMode of ['unavailable', 'throw'] as const) {
                    const unknown = new OfficeRouteFixture();
                    unknown.storage.failPutAfterStore = true;
                    unknown.clearMode = clearMode;
                    unknown.failOwnerReadAfterPut = true;
                    const response = await uploadCover(unknown);
                    const objectKey = unknown.storage.puts[0]!.key;
                    assert.equal(response.status, 500, clearMode);
                    assert.equal(unknown.clearAttempts, 3, clearMode);
                    assert.equal(
                        unknown.offices.get('owner-office')?.pending_cover_object_key,
                        objectKey,
                        clearMode
                    );
                    assert.equal(unknown.storage.objects.has(objectKey), true, clearMode);
                    assert.equal(unknown.storage.ownedDeletes.length, 0, clearMode);
                }

                const promoted = new OfficeRouteFixture();
                promoted.storage.failPutAfterStore = true;
                promoted.clearMode = 'promote';
                const response = await uploadCover(promoted);
                const objectKey = promoted.storage.puts[0]!.key;
                assert.equal(response.status, 500);
                assert.equal(
                    promoted.offices.get('owner-office')?.cover_object_key,
                    objectKey
                );
                assert.equal(
                    promoted.offices.get('owner-office')?.pending_cover_object_key,
                    null
                );
                assert.equal(promoted.storage.objects.has(objectKey), true);
                assert.equal(promoted.storage.ownedDeletes.length, 0);
            });

        test('cover upload reconciles withdrawal and unknown reads after object storage succeeds',
            async () => {
                const withdrawn = new OfficeRouteFixture();
                withdrawn.storage.afterPut = () => {
                    const office = withdrawn.offices.get('owner-office')!;
                    office.pending_cover_object_key = null;
                    office.pending_cover_submitted_at = null;
                    office.revision += 1;
                };
                const conflict = await uploadCover(withdrawn);
                const withdrawnKey = withdrawn.storage.puts[0]!.key;
                assert.equal(conflict.status, 409);
                assert.equal((await conflict.json() as { code: string }).code,
                    'FUDABA_OFFICE_CONFLICT');
                assert.equal(withdrawn.storage.objects.has(withdrawnKey), false);
                assert.equal(withdrawn.storage.ownedDeletes.length, 1);

                const unknown = new OfficeRouteFixture();
                unknown.failOwnerReadAfterPut = true;
                const failed = await uploadCover(unknown);
                const unknownKey = unknown.storage.puts[0]!.key;
                assert.equal(failed.status, 500);
                assert.equal(
                    unknown.offices.get('owner-office')?.pending_cover_object_key,
                    unknownKey
                );
                assert.equal(unknown.storage.objects.has(unknownKey), true);
                assert.equal(unknown.storage.ownedDeletes.length, 0);
            });

        test('cover upload consumes IP and account limits before multipart parsing', async () => {
            for (const bucket of ['fudaba-upload-attempt', 'platform-upload-account']) {
                const fixture = new OfficeRouteFixture();
                fixture.rateLimiter.deniedBuckets.add(bucket);
                const response = await uploadCover(fixture);
                assert.equal(response.status, 429, bucket);
                assert.equal(fixture.uploads.calls.length, 0, bucket);
                assert.equal(fixture.storage.puts.length, 0, bucket);
            }
            const successful = new OfficeRouteFixture();
            assert.equal((await uploadCover(successful)).status, 202);
            for (const bucket of [
                'fudaba-upload-attempt',
                'platform-upload-account',
                'platform-write-account'
            ]) {
                assert.equal(successful.rateLimiter.calls.includes(bucket), true, bucket);
            }
        });
    });
}

// fudaba-owner-routes.test.ts
{
    test.describe('Fudaba owner routes', () => {
        test('Fudaba public-read and owner-write flags remain independent', async () => {
            const readOnly = new OwnerRouteFixture({
                publicReadEnabled: true,
                writeEnabled: false
            });
            assert.equal((await readOnly.app.request(
                'http://ims.test/api/community/exchange/series'
            )).status, 200);
            const disabledWrite = await postCard(readOnly);
            assert.equal(disabledWrite.status, 404);
            assert.match(disabledWrite.headers.get('content-type') ?? '', /^text\/plain/i);
            assert.equal(await disabledWrite.text(), 'Not Found');
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
            assert.equal(
                (await contractJson(anonymous, fudabaErrorResponseSchema) as { code: string }).code,
                'PLATFORM_SESSION_INVALID'
            );

            const wrongRealm = await fixture.app.request(
                'http://ims.test/api/community/exchange/me/cards',
                { headers: { authorization: `Bearer ${BACKOFFICE_TOKEN}` } }
            );
            assert.equal(wrongRealm.status, 401);
            assert.equal(
                (await contractJson(wrongRealm, fudabaErrorResponseSchema) as { code: string }).code,
                'PLATFORM_SESSION_INVALID'
            );

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
            const listBody = await contractJson(list, fudabaOwnerCardListSchema);
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
            const detailBody = await contractJson(detail, fudabaOwnerCardDetailSchema);
            assert.equal(JSON.stringify(detailBody).includes('object_key'), false);
            assert.equal((await fixture.app.request(
                'http://ims.test/api/community/exchange/me/cards/other-card',
                { headers: bearerHeaders() }
            )).status, 404);
        });

        test.describe('card creation', () => {
            test('sniffs both images and writes only protected owner objects', async () => {
                const fixture = new OwnerRouteFixture();
                const response = await postCard(fixture);
                assert.equal(response.status, 201);
                const body = await contractJson(response, fudabaCardMutationResponseSchema);
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

            test('rejects empty idol selections before object writes', async () => {
                const fixture = new OwnerRouteFixture();
                fixture.uploads.next = {
                    ...cardUpload(),
                    fields: { ...cardFields(), favoriteIdolIds: '[]' }
                };

                const response = await postCard(fixture);
                assert.equal(response.status, 400);
                assert.equal(
                    (await contractJson(response, fudabaErrorResponseSchema) as { code: string }).code,
                    'FUDABA_CARD_INVALID'
                );
                assert.equal(fixture.storage.puts.length, 0);
                assert.equal(fixture.createInputs.length, 0);
            });

            test('rejects decoded image type mismatches before object writes', async () => {
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
        test('owner card upload rejects an unknown side with compatibility text', async () => {
            const fixture = new OwnerRouteFixture();
            const response = await fixture.app.request(
                'http://ims.test/api/community/exchange/uploads/unknown',
                { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
            );
            assert.equal(response.status, 404);
            assert.match(response.headers.get('content-type') ?? '', /^text\/plain/i);
            assert.equal(await response.text(), 'Not Found');
            assert.equal(fixture.uploads.calls.length, 0);
        });

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

        // A compatibility row is read back by the namecard readers, which reverse the
        // stored key into a public path and understand only the namecards layout. Those
        // readers run for every status except withdrawn and rejected, so the layout may
        // not drift while a card sits between reviews -- a Fudaba-layout key here used
        // to throw and blank the whole listing that contained the row.
        test('a compatibility card replacement keeps the namecards media layout', async () => {
            const fixture = new OwnerRouteFixture();
            fixture.cards.set('legacy-card', ownerCard({
                id: 'legacy-card',
                origin: 'legacy',
                legacy_card_id: 42,
                front_object_key: 'community/namecards/assets/legacy-42-front/image.webp',
                back_object_key: 'community/namecards/assets/legacy-42-back/image.webp',
                publication_status: 'published'
            }));
            fixture.uploads.next = mediaUpload({
                cardId: 'legacy-card',
                expectedRevision: '1'
            });
            const response = await fixture.app.request(
                'http://ims.test/api/community/exchange/uploads/front',
                { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
            );
            const body = await response.json();
            assert.equal(response.status, 200, JSON.stringify(body));
            assert.deepEqual(fixture.storage.puts.map((put) => put.key), [
                'community/namecards/assets/legacy-card-front/image.webp'
            ]);
            // The replacement is not public yet: `updateCardMediaForOwner` reset the
            // card to `pending`, so the object stays protected until the review
            // publishes the card again.
            assert.equal(fixture.storage.puts[0]!.options.protectedAccess, true);
            assert.equal(fixture.cards.get('legacy-card')?.publication_status, 'pending');
        });

        test('an exchange card replacement keeps the versioned owner layout', async () => {
            const fixture = new OwnerRouteFixture();
            fixture.uploads.next = mediaUpload({
                cardId: 'owner-card',
                expectedRevision: '1'
            });
            const response = await fixture.app.request(
                'http://ims.test/api/community/exchange/uploads/back',
                { method: 'PUT', headers: bearerHeaders(), body: new FormData() }
            );
            const body = await response.json();
            assert.equal(response.status, 200, JSON.stringify(body));
            const keys = fixture.storage.puts.map((put) => put.key);
            assert.equal(keys.length, 1);
            assert.match(
                keys[0]!,
                /^community\/fudaba\/cards\/owner-card\/versions\/[^/]+\/back\.webp$/
            );
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
            assert.deepEqual(await contractJson(response, fudabaCardDeleteResponseSchema), {
                success: true,
                revision: 2
            });
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
                'http://ims.test/api/community/exchange/me/cards/owner-card/media/front?v=1',
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
                'http://ims.test/api/community/exchange/me/cards/owner-card/media/back?v=1',
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
    });
}

// fudaba-owner-write-repository.test.ts
{
    const CREATED_AT = '2026-08-02T03:00:00.000Z';
    const UPDATED_AT = '2026-08-02T03:01:00.000Z';
    const MEDIA_UPDATED_AT = '2026-08-02T03:02:00.000Z';
    const DELETED_AT = '2026-08-02T03:03:00.000Z';
    const PROFILE_CREATED_AT = 1_775_100_000_000;

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined
    };

    interface Fixture {
        database: ManagedSqlDatabase;
        platform: SqlPlatformAccountRepository;
        fudaba: SqlFudabaRepository;
        dialect: 'postgresql';
    }

    async function createFixture(
        dialect: Fixture['dialect']
    ): Promise<Fixture> {
        const harness = await createPostgresTestHarness();
        const platform = new SqlPlatformAccountRepository(
            harness.connection,
            initializedPostgresSchema
        );
        const fudaba = new SqlFudabaRepository(
            harness.connection,
            initializedPostgresSchema
        );
        onTestFinished(() => harness.close());
        await Promise.all([platform.initialize(), fudaba.initialize()]);
        await seedCanonicalFudabaAgencies(harness.connection);
        return { database: harness.connection, platform, fudaba, dialect };
    }

    function account(
        id: string,
        status: PlatformAccountStatus = 'active',
        avatarObjectKey: string | null = null
    ): NewPlatformAccountInput {
        return {
            id,
            status,
            tokenVersion: 0,
            createdAt: PROFILE_CREATED_AT,
            updatedAt: PROFILE_CREATED_AT,
            deletedAt: status === 'deleted' ? PROFILE_CREATED_AT : null,
            profile: {
                displayName: `Producer ${id}`,
                avatarObjectKey,
                avatarExternalUrl: null,
                homeCity: null,
                bio: '',
                updatedAt: PROFILE_CREATED_AT
            }
        };
    }

    function ownedCard(
        id: string,
        ownerAccountId: string,
        seriesCode = '765'
    ): CreateOwnedFudabaCardInput {
        return {
            id,
            ownerAccountId,
            producerName: `Producer ${ownerAccountId}`,
            displayName: `Card ${id}`,
            seriesCode,
            favoriteIdol: 'Haruka',
            favoriteIdolIds: [900_001],
            frontObjectKey: `community/fudaba/cards/${id}/front.webp`,
            backObjectKey: `community/fudaba/cards/${id}/back.webp`,
            accent: '#4f64dd',
            bio: 'Profile',
            tradeNote: 'Available for trade',
            available: true,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT
        };
    }

    function importedCard(
        id: string,
        ownerAccountId: string
    ): NewFudabaCardInput {
        return {
            ...ownedCard(id, ownerAccountId),
            sourceUrl: 'https://example.test/source',
            sourceLabel: 'Imported source',
            sourceCredit: 'Migration',
            mediaRightsStatus: 'approved',
            publicationStatus: 'published',
            revision: 0,
            deletedAt: null
        };
    }

    async function assertProfileWrites(fixture: Fixture): Promise<void> {
        const ownerId = `${fixture.dialect}-profile-owner`;
        const previousAvatar = `community/fudaba/accounts/${ownerId}/old-avatar.webp`;
        await fixture.platform.createAccountWithProfile(
            account(ownerId, 'active', previousAvatar)
        );

        const textSaved = await fixture.platform.updateProfileTextForOwner({
            accountId: ownerId,
            displayName: 'Updated Producer',
            homeCity: 'Shanghai',
            bio: 'Updated profile',
            expectedUpdatedAt: PROFILE_CREATED_AT,
            updatedAt: PROFILE_CREATED_AT + 1
        });
        assert.equal(textSaved.status, 'saved');
        if (textSaved.status !== 'saved') return;
        assert.equal(textSaved.previousAvatarObjectKey, previousAvatar);
        assert.equal(textSaved.profile.avatar_object_key, previousAvatar);
        assert.equal(textSaved.profile.display_name, 'Updated Producer');

        assert.deepEqual(await fixture.platform.updateProfileAvatarForOwner({
            accountId: ownerId,
            avatarObjectKey: 'unreachable-stale-avatar.webp',
            expectedUpdatedAt: PROFILE_CREATED_AT,
            updatedAt: PROFILE_CREATED_AT + 2
        }), {
            status: 'conflict',
            updatedAt: PROFILE_CREATED_AT + 1
        });

        const nextAvatar = `community/fudaba/accounts/${ownerId}/next-avatar.webp`;
        const avatarSaved = await fixture.platform.updateProfileAvatarForOwner({
            accountId: ownerId,
            avatarObjectKey: nextAvatar,
            expectedUpdatedAt: PROFILE_CREATED_AT + 1,
            updatedAt: PROFILE_CREATED_AT + 2
        });
        assert.equal(avatarSaved.status, 'saved');
        if (avatarSaved.status !== 'saved') return;
        assert.equal(avatarSaved.previousAvatarObjectKey, previousAvatar);
        assert.equal(avatarSaved.profile.avatar_object_key, nextAvatar);
        assert.equal(avatarSaved.profile.avatar_external_url, null);

        await fixture.database.prepare(
            "UPDATE platform_accounts SET status='restricted' WHERE id=?"
        ).bind(ownerId).run();
        assert.deepEqual(await fixture.platform.updateProfileTextForOwner({
            accountId: ownerId,
            displayName: 'Restricted update',
            homeCity: null,
            bio: '',
            expectedUpdatedAt: PROFILE_CREATED_AT + 2,
            updatedAt: PROFILE_CREATED_AT + 3
        }), { status: 'unavailable' });
        assert.equal(
            (await fixture.platform.findAccountWithProfileById(ownerId))?.profile.display_name,
            'Updated Producer'
        );
        assert.deepEqual(await fixture.platform.updateProfileAvatarForOwner({
            accountId: `${fixture.dialect}-missing-profile`,
            avatarObjectKey: null,
            expectedUpdatedAt: PROFILE_CREATED_AT,
            updatedAt: PROFILE_CREATED_AT + 1
        }), { status: 'unavailable' });
    }

    async function assertCardWrites(fixture: Fixture): Promise<void> {
        const ownerId = `${fixture.dialect}-card-owner`;
        const otherId = `${fixture.dialect}-card-other`;
        const restrictedId = `${fixture.dialect}-card-restricted`;
        await fixture.platform.createAccountWithProfile(account(ownerId));
        await fixture.platform.createAccountWithProfile(account(otherId));
        await fixture.platform.createAccountWithProfile(account(restrictedId, 'restricted'));

        assert.deepEqual(await fixture.fudaba.createCardForOwner({
            ...ownedCard(`${fixture.dialect}-empty-idols-card`, ownerId),
            favoriteIdolIds: []
        }), { status: 'unavailable' });
        assert.deepEqual(await fixture.fudaba.createCardForOwner({
            ...ownedCard(`${fixture.dialect}-duplicate-idols-card`, ownerId),
            favoriteIdolIds: [900_001, 900_001]
        }), { status: 'unavailable' });
        assert.deepEqual(await fixture.fudaba.createCardForOwner({
            ...ownedCard(`${fixture.dialect}-missing-idol-card`, ownerId),
            favoriteIdolIds: [999_999]
        }), { status: 'unavailable' });

        assert.deepEqual(await fixture.fudaba.createCardForOwner(ownedCard(
            `${fixture.dialect}-restricted-card`,
            restrictedId
        )), { status: 'unavailable' });
        await fixture.database.prepare(
            "UPDATE agencies SET wiki_enabled=FALSE WHERE code='876'"
        ).run();
        assert.deepEqual(await fixture.fudaba.createCardForOwner(ownedCard(
            `${fixture.dialect}-disabled-series-card`,
            ownerId,
            '876'
        )), { status: 'unavailable' });

        const cardId = `${fixture.dialect}-owned-card`;
        const created = await fixture.fudaba.createCardForOwner(ownedCard(cardId, ownerId));
        assert.equal(created.status, 'saved');
        if (created.status !== 'saved') return;
        assert.equal(created.card.owner_account_id, ownerId);
        assert.equal(created.card.media_rights_status, 'unknown');
        assert.equal(created.card.publication_status, 'pending');
        assert.equal(created.card.revision, 0);
        assert.equal(created.card.source_url, null);
        assert.equal(created.card.favorite_idol, '测试春香');
        assert.deepEqual(
            created.card.favorite_idols.map((idol) => idol.idol_id),
            [900_001]
        );

        const otherCardId = `${fixture.dialect}-other-card`;
        await fixture.fudaba.createCard(importedCard(otherCardId, otherId));
        assert.equal(await fixture.fudaba.findCardForOwner(cardId, otherId), null);
        assert.deepEqual(
            (await fixture.fudaba.listCardsForOwner(ownerId)).map((card) => card.id),
            [cardId]
        );

        assert.deepEqual(await fixture.fudaba.updateCardMetadataForOwner({
            cardId,
            ownerAccountId: otherId,
            producerName: 'Intruder',
            displayName: 'Intruder',
            seriesCode: '765',
            favoriteIdol: '',
            favoriteIdolIds: [900_001],
            accent: '#ffffff',
            bio: '',
            tradeNote: '',
            available: false,
            expectedRevision: 0,
            updatedAt: UPDATED_AT
        }), { status: 'unavailable' });

        await fixture.database.prepare(
            `UPDATE fudaba_cards
         SET media_rights_status='approved', publication_status='published'
         WHERE id=?`
        ).bind(cardId).run();
        await fixture.database.prepare(
            "UPDATE agencies SET wiki_enabled=FALSE WHERE code='cg'"
        ).run();
        const metadataInput = {
            cardId,
            ownerAccountId: ownerId,
            producerName: 'Updated Producer',
            displayName: 'Updated Card',
            seriesCode: 'cg',
            favoriteIdol: 'Uzuki',
            favoriteIdolIds: [900_001, 900_002] as number[],
            accent: '#ef5b6c',
            bio: 'Updated bio',
            tradeNote: 'Updated note',
            available: false,
            expectedRevision: 0,
            updatedAt: UPDATED_AT
        } as const;
        assert.deepEqual(
            await fixture.fudaba.updateCardMetadataForOwner(metadataInput),
            { status: 'unavailable' }
        );
        await fixture.database.prepare(
            "UPDATE agencies SET wiki_enabled=TRUE WHERE code='cg'"
        ).run();

        assert.deepEqual(await fixture.fudaba.updateCardMetadataForOwner({
            ...metadataInput,
            favoriteIdolIds: [900_001, 900_001]
        }), { status: 'unavailable' });
        assert.deepEqual(await fixture.fudaba.updateCardMetadataForOwner({
            ...metadataInput,
            favoriteIdolIds: [999_999]
        }), { status: 'unavailable' });

        const metadataSaved = await fixture.fudaba.updateCardMetadataForOwner(metadataInput);
        assert.equal(metadataSaved.status, 'saved');
        if (metadataSaved.status !== 'saved') return;
        assert.equal(metadataSaved.card.revision, 1);
        assert.equal(metadataSaved.card.series_code, 'cg');
        assert.equal(metadataSaved.card.favorite_idol, '测试春香、测试卯月');
        assert.deepEqual(
            metadataSaved.card.favorite_idols.map((idol) => ({
                id: idol.idol_id,
                agency: idol.agency_code
            })),
            [
                { id: 900_001, agency: '765' },
                { id: 900_002, agency: 'cg' }
            ]
        );
        assert.equal(metadataSaved.card.media_rights_status, 'unknown');
        assert.equal(metadataSaved.card.publication_status, 'pending');
        assert.deepEqual(await fixture.fudaba.updateCardMetadataForOwner({
            ...metadataInput,
            displayName: 'Stale update',
            updatedAt: MEDIA_UPDATED_AT
        }), { status: 'conflict', revision: 1 });

        await fixture.database.prepare(
            `UPDATE fudaba_cards
         SET media_rights_status='approved', publication_status='published'
         WHERE id=?`
        ).bind(cardId).run();
        const nextFront = `community/fudaba/cards/${cardId}/front-next.webp`;
        const mediaSaved = await fixture.fudaba.updateCardMediaForOwner({
            cardId,
            ownerAccountId: ownerId,
            side: 'front',
            objectKey: nextFront,
            expectedRevision: 1,
            updatedAt: MEDIA_UPDATED_AT
        });
        assert.equal(mediaSaved.status, 'saved');
        if (mediaSaved.status !== 'saved') return;
        assert.equal(
            mediaSaved.previousObjectKey,
            ownedCard(cardId, ownerId).frontObjectKey
        );
        assert.equal(mediaSaved.card.front_object_key, nextFront);
        assert.equal(mediaSaved.card.revision, 2);
        assert.equal(mediaSaved.card.media_rights_status, 'unknown');
        assert.equal(mediaSaved.card.publication_status, 'pending');

        await fixture.database.prepare(
            "UPDATE platform_accounts SET status='restricted' WHERE id=?"
        ).bind(ownerId).run();
        assert.deepEqual(await fixture.fudaba.updateCardMediaForOwner({
            cardId,
            ownerAccountId: ownerId,
            side: 'back',
            objectKey: `community/fudaba/cards/${cardId}/back-blocked.webp`,
            expectedRevision: 2,
            updatedAt: DELETED_AT
        }), { status: 'unavailable' });
        await fixture.database.prepare(
            "UPDATE platform_accounts SET status='active' WHERE id=?"
        ).bind(ownerId).run();

        const deleted = await fixture.fudaba.softDeleteCardForOwner({
            cardId,
            ownerAccountId: ownerId,
            expectedRevision: 2,
            deletedAt: DELETED_AT
        });
        assert.equal(deleted.status, 'saved');
        if (deleted.status !== 'saved') return;
        assert.equal(deleted.card.deleted_at, DELETED_AT);
        assert.equal(deleted.card.revision, 3);
        assert.equal(await fixture.fudaba.findCardForOwner(cardId, ownerId), null);
        assert.deepEqual(await fixture.fudaba.listCardsForOwner(ownerId), []);
        assert.deepEqual(await fixture.fudaba.softDeleteCardForOwner({
            cardId,
            ownerAccountId: ownerId,
            expectedRevision: 3,
            deletedAt: DELETED_AT
        }), { status: 'unavailable' });
    }

    async function assertCrossInstanceCas(fixture: Fixture): Promise<void> {
        const siblingPlatform = new SqlPlatformAccountRepository(
            fixture.database,
            initializedPostgresSchema
        );
        const siblingFudaba = new SqlFudabaRepository(
            fixture.database,
            initializedPostgresSchema
        );
        await Promise.all([siblingPlatform.initialize(), siblingFudaba.initialize()]);

        const accountId = `${fixture.dialect}-cas-owner`;
        await fixture.platform.createAccountWithProfile(account(accountId));
        const profileResults = await Promise.all([
            fixture.platform.updateProfileTextForOwner({
                accountId,
                displayName: 'First writer',
                homeCity: null,
                bio: '',
                expectedUpdatedAt: PROFILE_CREATED_AT,
                updatedAt: PROFILE_CREATED_AT + 10
            }),
            siblingPlatform.updateProfileTextForOwner({
                accountId,
                displayName: 'Second writer',
                homeCity: null,
                bio: '',
                expectedUpdatedAt: PROFILE_CREATED_AT,
                updatedAt: PROFILE_CREATED_AT + 20
            })
        ]);
        assert.deepEqual(
            profileResults.map((result) => result.status).sort(),
            ['conflict', 'saved']
        );
        const savedProfile = profileResults.find((result) => result.status === 'saved');
        const profileConflict = profileResults.find((result) => result.status === 'conflict');
        assert.ok(savedProfile && savedProfile.status === 'saved');
        assert.ok(profileConflict && profileConflict.status === 'conflict');
        assert.equal(profileConflict.updatedAt, savedProfile.profile.updated_at);

        const cardId = `${fixture.dialect}-cas-card`;
        const created = await fixture.fudaba.createCardForOwner(ownedCard(cardId, accountId));
        assert.equal(created.status, 'saved');
        const baseUpdate = {
            cardId,
            ownerAccountId: accountId,
            producerName: 'CAS Producer',
            seriesCode: '765',
            favoriteIdol: '',
            favoriteIdolIds: [900_001] as number[],
            accent: '#4f64dd',
            bio: '',
            tradeNote: '',
            available: true,
            expectedRevision: 0,
            updatedAt: UPDATED_AT
        } as const;
        const cardResults = await Promise.all([
            fixture.fudaba.updateCardMetadataForOwner({
                ...baseUpdate,
                displayName: 'First card writer'
            }),
            siblingFudaba.updateCardMetadataForOwner({
                ...baseUpdate,
                displayName: 'Second card writer'
            })
        ]);
        assert.deepEqual(
            cardResults.map((result) => result.status).sort(),
            ['conflict', 'saved']
        );
        const cardConflict = cardResults.find((result) => result.status === 'conflict');
        assert.ok(cardConflict && cardConflict.status === 'conflict');
        assert.equal(cardConflict.revision, 1);
    }

    describe('Fudaba owner write repository', () => {
        postgresTest('real PostgreSQL enforces Stage 14 profile and card write fences', async () => {
            const fixture = await createFixture('postgresql');
            await assertProfileWrites(fixture);
            await assertCardWrites(fixture);
            await assertCrossInstanceCas(fixture);
        });
    });
}

// fudaba-public-read-repository.test.ts
{
    const OFFICE_CREATED_AT = "2026-08-02T00:00:00.000Z";
    const OFFICE_UPDATED_AT = "2026-08-02T00:01:00.000Z";
    const CARD_OLDEST_AT = "2026-08-02T01:00:00.000Z";
    const CARD_OLD_AT = "2026-08-02T02:00:00.000Z";
    const CARD_NEW_AT = "2026-08-02T03:00:00.000Z";
    const CARD_DELETED_AT = "2026-08-02T04:00:00.000Z";

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined,
    };

    interface Fixture {
        database: ManagedSqlDatabase;
        repository: SqlFudabaRepository;
        dialect: "postgresql";
    }

    async function createFixture(
        dialect: Fixture["dialect"],
    ): Promise<Fixture> {
        const harness = await createPostgresTestHarness();
        const repository = new SqlFudabaRepository(
            harness.connection,
            initializedPostgresSchema,
        );
        onTestFinished(() => harness.close());
        await repository.initialize();
        await seedCanonicalFudabaAgencies(harness.connection);
        return { database: harness.connection, repository, dialect };
    }

    function office(
        id: string,
        overrides: Partial<NewFudabaOfficeInput> = {},
    ): NewFudabaOfficeInput {
        return {
            id,
            ownerAccountId: "owner",
            slug: id,
            name: `Office ${id}`,
            intro: `Intro ${id}`,
            city: "Shanghai",
            address: `Private address ${id}`,
            latitude: 31.2304,
            longitude: 121.4737,
            accent: "#ef5b6c",
            coverObjectKey: `community/fudaba/offices/${id}/cover.webp`,
            isOpen: true,
            visitorCount: 0,
            status: "active",
            revision: 0,
            createdAt: OFFICE_CREATED_AT,
            updatedAt: OFFICE_CREATED_AT,
            archivedAt: null,
            seriesCodes: ["765"],
            ...overrides,
        };
    }

    function card(
        id: string,
        overrides: Partial<NewFudabaCardInput> = {},
    ): NewFudabaCardInput {
        return {
            id,
            ownerAccountId: "owner",
            producerName: `Producer ${id}`,
            displayName: `Card ${id}`,
            seriesCode: "765",
            favoriteIdol: "Haruka",
            favoriteIdolIds: [900_001],
            frontObjectKey: `community/fudaba/cards/${id}/front.webp`,
            backObjectKey: `community/fudaba/cards/${id}/back.webp`,
            accent: "#4f64dd",
            bio: `Bio ${id}`,
            tradeNote: `Trade ${id}`,
            available: true,
            sourceUrl: "https://example.test/source",
            sourceLabel: "Source",
            sourceCredit: "Creator",
            mediaRightsStatus: "approved",
            publicationStatus: "published",
            revision: 0,
            createdAt: CARD_OLD_AT,
            updatedAt: CARD_OLD_AT,
            deletedAt: null,
            ...overrides,
        };
    }

    async function seedAccount(
        fixture: Fixture,
        accountId: string,
        status: PlatformAccountStatus = "active",
    ): Promise<void> {
        const createdAt = 1_700_000_000_000;
        await fixture.database
            .prepare(
                `INSERT INTO platform_accounts
            (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, 0, ?, ?, ?)`,
            )
            .bind(
                accountId,
                status,
                createdAt,
                createdAt,
                status === "deleted" ? createdAt : null,
            )
            .run();
    }

    async function placeCard(
        fixture: Fixture,
        officeId: string,
        cardId: string,
        zIndex: number,
        ownerAccountId = "owner",
    ): Promise<void> {
        assert.equal(
            await fixture.repository.placeOwnedCard({
                officeId,
                cardId,
                ownerAccountId,
                pinnedAt: CARD_OLD_AT,
                positionX: 10 + zIndex,
                positionY: 20 + zIndex,
                rotation: zIndex,
                zIndex,
            }),
            true,
        );
    }

    function assertOfficePrivacy(record: Record<string, unknown>): void {
        assert.equal(typeof record.address, "string", "address must be public");
        for (const privateKey of ["owner_account_id", "latitude", "longitude"]) {
            assert.equal(
                privateKey in record,
                false,
                `${privateKey} must stay private`,
            );
        }
    }

    async function assertPublicReadModels(
        dialect: Fixture["dialect"],
    ): Promise<void> {
        const fixture = await createFixture(dialect);
        for (const accountId of ["owner", "viewer", "other-viewer"]) {
            await seedAccount(fixture, accountId);
        }
        await seedAccount(fixture, "restricted-owner", "restricted");
        await seedAccount(fixture, "suspended-owner", "suspended");
        await seedAccount(fixture, "deleted-owner", "deleted");

        await fixture.database
            .prepare("UPDATE agencies SET wiki_enabled=? WHERE code=?")
            .bind(false, "sidem")
            .run();

        await fixture.repository.createOffice(
            office("office-a-closed", {
                isOpen: false,
                visitorCount: 100,
                seriesCodes: ["765", "cg"],
            }),
        );
        await fixture.repository.createOffice(
            office("office-b-open", {
                visitorCount: 100,
                seriesCodes: ["765", "cg", "sidem"],
            }),
        );
        await fixture.repository.createOffice(
            office("office-c-beijing", {
                city: "Beijing",
                visitorCount: 50,
                seriesCodes: ["ml"],
            }),
        );
        await fixture.repository.createOffice(
            office("office-hidden", {
                status: "hidden",
                visitorCount: 999,
                seriesCodes: ["cg"],
            }),
        );
        await fixture.repository.createOffice(
            office("office-archived", {
                status: "archived",
                archivedAt: OFFICE_UPDATED_AT,
                updatedAt: OFFICE_UPDATED_AT,
                visitorCount: 998,
                seriesCodes: ["765"],
            }),
        );
        await fixture.repository.createOffice(
            office("office-d-restricted", {
                ownerAccountId: "restricted-owner",
                visitorCount: 40,
            }),
        );
        await fixture.repository.createOffice(
            office("office-suspended-owner", {
                ownerAccountId: "suspended-owner",
                visitorCount: 997,
            }),
        );
        await fixture.repository.createOffice(
            office("office-deleted-owner", {
                ownerAccountId: "deleted-owner",
                visitorCount: 996,
            }),
        );

        const series = await fixture.repository.listPublicSeries();
        assert.equal(
            series.some((item) => item.code === "sidem"),
            false,
        );
        assert.deepEqual(
            series.slice(0, 3).map((item) => [item.code, item.active_office_count]),
            [
                ["765", 3],
                ["876", 0],
                ["cg", 2],
            ],
        );
        assert.deepEqual(series[0], {
            id: 1,
            code: "765",
            display_name: "765PRO",
            color: "#f34f6d",
            display_order: 0,
            icon_object_key: "wiki/shared/static/icon/765pro.webp",
            image_transform: {
                fit: "contain",
                focalX: 0.5,
                focalY: 0.5,
                zoom: 1,
                rotation: 0,
            },
            active_office_count: 3,
        });

        const firstOfficePage = await fixture.repository.listPublicOffices({
            limit: 1,
        });
        assert.deepEqual(
            firstOfficePage.map((item) => item.id),
            ["office-a-closed"],
        );
        assertOfficePrivacy(
            firstOfficePage[0] as unknown as Record<string, unknown>,
        );
        assert.equal(
            firstOfficePage[0].cover_object_key?.endsWith("cover.webp"),
            true,
        );
        const nextOfficePage = await fixture.repository.listPublicOffices({
            limit: 5,
            after: { visitorCount: 100, id: "office-a-closed" },
        });
        assert.deepEqual(
            nextOfficePage.map((item) => item.id),
            ["office-b-open", "office-c-beijing", "office-d-restricted"],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicOffices({
                    city: "Shanghai",
                    seriesCodes: ["cg"],
                    isOpen: true,
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            ["office-b-open"],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicOffices({
                    isOpen: false,
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            ["office-a-closed"],
        );
        assert.deepEqual(
            await fixture.repository.listPublicOffices({
                seriesCodes: ["sidem"],
                limit: 10,
            }),
            [],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicOffices({
                    seriesCodes: ["cg", "ml"],
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            ["office-a-closed", "office-b-open", "office-c-beijing"],
        );
        assert.deepEqual(
            await fixture.repository.listPublicOffices({
                city: "Shang",
                limit: 10,
            }),
            [],
        );

        const cardInputs = [
            card("card-z-new", { createdAt: CARD_NEW_AT, updatedAt: CARD_NEW_AT }),
            card("card-y-new", { createdAt: CARD_NEW_AT, updatedAt: CARD_NEW_AT }),
            card("card-unavailable", {
                available: false,
                createdAt: CARD_OLD_AT,
                updatedAt: CARD_OLD_AT,
            }),
            card("card-cinderella-old", {
                seriesCode: "cg",
                createdAt: CARD_OLDEST_AT,
                updatedAt: CARD_OLDEST_AT,
            }),
            card("card-hidden-office", {
                createdAt: CARD_OLDEST_AT,
                updatedAt: CARD_OLDEST_AT,
            }),
            card("card-restricted-owner", {
                ownerAccountId: "restricted-owner",
                createdAt: CARD_OLDEST_AT,
                updatedAt: CARD_OLDEST_AT,
            }),
            card("card-suspended-owner", {
                ownerAccountId: "suspended-owner",
                createdAt: CARD_OLDEST_AT,
                updatedAt: CARD_OLDEST_AT,
            }),
            card("card-deleted-owner", {
                ownerAccountId: "deleted-owner",
                createdAt: CARD_OLDEST_AT,
                updatedAt: CARD_OLDEST_AT,
            }),
            card("card-disabled-series", {
                seriesCode: "sidem",
                createdAt: CARD_OLDEST_AT,
                updatedAt: CARD_OLDEST_AT,
            }),
            card("card-pending", {
                publicationStatus: "pending",
                createdAt: CARD_NEW_AT,
                updatedAt: CARD_NEW_AT,
            }),
            card("card-unapproved", {
                mediaRightsStatus: "unknown",
                publicationStatus: "pending",
                createdAt: CARD_NEW_AT,
                updatedAt: CARD_NEW_AT,
            }),
            card("card-deleted", {
                createdAt: CARD_NEW_AT,
                updatedAt: CARD_NEW_AT,
            }),
        ];
        for (const input of cardInputs) {
            await fixture.repository.createCard(input);
        }
        await placeCard(fixture, "office-b-open", "card-y-new", 1);
        await placeCard(fixture, "office-b-open", "card-z-new", 2);
        await placeCard(fixture, "office-b-open", "card-unavailable", 3);
        await placeCard(fixture, "office-b-open", "card-pending", 4);
        await placeCard(fixture, "office-b-open", "card-unapproved", 5);
        await placeCard(fixture, "office-b-open", "card-deleted", 6);
        await placeCard(
            fixture,
            "office-b-open",
            "card-restricted-owner",
            7,
            "restricted-owner",
        );
        await placeCard(
            fixture,
            "office-b-open",
            "card-suspended-owner",
            8,
            "suspended-owner",
        );
        await placeCard(
            fixture,
            "office-b-open",
            "card-deleted-owner",
            9,
            "deleted-owner",
        );
        await placeCard(fixture, "office-b-open", "card-disabled-series", 10);
        await fixture.database
            .prepare(
                "UPDATE fudaba_offices SET status='active' WHERE id='office-hidden'",
            )
            .run();
        await placeCard(fixture, "office-hidden", "card-hidden-office", 1);
        await fixture.database
            .prepare(
                "UPDATE fudaba_offices SET status='hidden' WHERE id='office-hidden'",
            )
            .run();
        await placeCard(fixture, "office-suspended-owner", "card-hidden-office", 1);
        await fixture.database
            .prepare(
                `UPDATE fudaba_cards
         SET deleted_at=?, updated_at=?, revision=revision+1
         WHERE id='card-deleted'`,
            )
            .bind(CARD_DELETED_AT, CARD_DELETED_AT)
            .run();

        for (const [kind, accountId] of [
            ["like", "viewer"],
            ["like", "other-viewer"],
            ["favorite", "viewer"],
        ] as const) {
            assert.equal(
                await fixture.repository.setCardInteraction({
                    kind,
                    cardId: "card-z-new",
                    accountId,
                    active: true,
                    createdAt: CARD_DELETED_AT,
                }),
                true,
            );
        }
        assert.equal(
            await fixture.repository.setCardInteraction({
                kind: "favorite",
                cardId: "card-y-new",
                accountId: "other-viewer",
                active: true,
                createdAt: CARD_DELETED_AT,
            }),
            true,
        );

        const detail = await fixture.repository.findPublicOfficeBySlug(
            "office-b-open",
            "viewer",
        );
        assert.ok(detail);
        assertOfficePrivacy(detail as unknown as Record<string, unknown>);
        assert.deepEqual(detail.series_codes, ["765", "cg"]);
        assert.deepEqual(
            detail.cards.map((item) => item.id),
            [
                "card-y-new",
                "card-z-new",
                "card-unavailable",
                "card-restricted-owner",
            ],
        );
        assert.deepEqual(
            detail.cards.map((item) => item.z_index),
            [1, 2, 3, 7],
        );
        const likedCard = detail.cards.find((item) => item.id === "card-z-new");
        assert.ok(likedCard);
        assert.equal(likedCard.like_count, 2);
        assert.equal(likedCard.favorite_count, 1);
        assert.equal(likedCard.viewer_liked, true);
        assert.equal(likedCard.viewer_favorited, true);
        assert.equal(likedCard.viewer_owned, false);
        assert.equal(likedCard.revision, 0);
        assert.equal(likedCard.updated_at, CARD_OLD_AT);
        assert.equal("owner_account_id" in likedCard, false);
        const ownerDetail = await fixture.repository.findPublicOfficeBySlug(
            "office-b-open",
            "owner",
        );
        assert.equal(
            ownerDetail?.cards.find((item) => item.id === "card-z-new")
                ?.viewer_owned,
            true,
        );
        assert.equal(
            await fixture.repository.findPublicOfficeBySlug("office-hidden", null),
            null,
        );
        assert.equal(
            await fixture.repository.findPublicOfficeBySlug(
                "office-suspended-owner",
                null,
            ),
            null,
        );
        assert.equal(
            await fixture.repository.findPublicOfficeBySlug(
                "office-deleted-owner",
                null,
            ),
            null,
        );
        const restrictedDetail = await fixture.repository.findPublicOfficeBySlug(
            "office-d-restricted",
            null,
        );
        assert.ok(restrictedDetail);
        assertOfficePrivacy(restrictedDetail as unknown as Record<string, unknown>);

        const firstCardPage = await fixture.repository.listPublicCards({
            viewerAccountId: null,
            limit: 1,
        });
        assert.deepEqual(
            firstCardPage.map((item) => item.id),
            ["card-z-new"],
        );
        assert.equal(firstCardPage[0].viewer_liked, false);
        assert.equal(firstCardPage[0].viewer_favorited, false);
        assert.equal(firstCardPage[0].like_count, 2);
        assert.equal("owner_account_id" in firstCardPage[0], false);
        const allPublicCards = await fixture.repository.listPublicCards({
            viewerAccountId: null,
            limit: 100,
        });
        assert.equal(
            allPublicCards.some((item) => item.id === "card-restricted-owner"),
            true,
        );
        for (const hiddenId of [
            "card-suspended-owner",
            "card-deleted-owner",
            "card-disabled-series",
            "card-pending",
            "card-unapproved",
            "card-deleted",
        ]) {
            assert.equal(
                allPublicCards.some((item) => item.id === hiddenId),
                false,
                hiddenId,
            );
        }
        const nextCardPage = await fixture.repository.listPublicCards({
            viewerAccountId: "viewer",
            limit: 2,
            after: { createdAt: CARD_NEW_AT, id: "card-z-new" },
        });
        assert.deepEqual(
            nextCardPage.map((item) => item.id),
            ["card-y-new", "card-unavailable"],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicCards({
                    seriesCodes: ["765"],
                    available: true,
                    officeSlug: "office-b-open",
                    viewerAccountId: "viewer",
                    limit: 10,
                    after: { createdAt: CARD_NEW_AT, id: "card-z-new" },
                })
                .then((items) => items.map((item) => item.id)),
            ["card-y-new", "card-restricted-owner"],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicCards({
                    seriesCodes: ["cg"],
                    viewerAccountId: null,
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            ["card-cinderella-old"],
        );
        assert.deepEqual(
            await fixture.repository.listPublicCards({
                seriesCodes: ["sidem"],
                viewerAccountId: null,
                limit: 10,
            }),
            [],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicCards({
                    seriesCodes: ["765", "cg"],
                    viewerAccountId: null,
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            [
                "card-z-new",
                "card-y-new",
                "card-unavailable",
                "card-restricted-owner",
                "card-hidden-office",
                "card-cinderella-old",
            ],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicCards({
                    available: false,
                    viewerAccountId: null,
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            ["card-unavailable"],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicCards({
                    officeSlug: "office-b-open",
                    viewerAccountId: null,
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            [
                "card-z-new",
                "card-y-new",
                "card-unavailable",
                "card-restricted-owner",
            ],
        );
        assert.deepEqual(
            await fixture.repository.listPublicCards({
                officeSlug: "office-hidden",
                viewerAccountId: null,
                limit: 10,
            }),
            [],
        );
        assert.deepEqual(
            await fixture.repository.listPublicCards({
                officeSlug: "office-suspended-owner",
                viewerAccountId: null,
                limit: 10,
            }),
            [],
        );

        assert.deepEqual(
            await fixture.repository
                .listPublicCards({
                    favoritedByAccountId: "viewer",
                    viewerAccountId: "viewer",
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            ["card-z-new"],
        );
        assert.deepEqual(
            await fixture.repository
                .listPublicCards({
                    favoritedByAccountId: "other-viewer",
                    viewerAccountId: "other-viewer",
                    limit: 10,
                })
                .then((items) => items.map((item) => item.id)),
            ["card-y-new"],
        );
        assert.deepEqual(
            await fixture.repository.listPublicCards({
                favoritedByAccountId: "owner",
                viewerAccountId: "owner",
                limit: 10,
            }),
            [],
        );

        assert.deepEqual(
            await fixture.repository.findPublicCardInteractions(
                "card-z-new",
                "viewer",
            ),
            {
                like_count: 2,
                favorite_count: 1,
                viewer_liked: true,
                viewer_favorited: true,
            },
        );
        assert.deepEqual(
            await fixture.repository.findPublicCardInteractions(
                "card-z-new",
                null,
            ),
            {
                like_count: 2,
                favorite_count: 1,
                viewer_liked: false,
                viewer_favorited: false,
            },
        );
        for (const hiddenId of [
            "card-deleted",
            "card-pending",
            "card-suspended-owner",
            "missing-card",
        ]) {
            assert.equal(
                await fixture.repository.findPublicCardInteractions(
                    hiddenId,
                    "viewer",
                ),
                null,
                hiddenId,
            );
        }

        assert.equal(
            await fixture.repository.setCardInteraction({
                kind: "favorite",
                cardId: "card-z-new",
                accountId: "viewer",
                active: false,
                createdAt: CARD_DELETED_AT,
            }),
            true,
        );
        assert.deepEqual(
            await fixture.repository.findPublicCardInteractions(
                "card-z-new",
                "viewer",
            ),
            {
                like_count: 2,
                favorite_count: 0,
                viewer_liked: true,
                viewer_favorited: false,
            },
        );
        assert.deepEqual(
            await fixture.repository.listPublicCards({
                favoritedByAccountId: "viewer",
                viewerAccountId: "viewer",
                limit: 10,
            }),
            [],
        );
    }

    describe('Fudaba public read repository', () => {
        postgresTest("PostgreSQL exposes the same Fudaba public read models", async () => {
            await assertPublicReadModels("postgresql");
        });
    });
}

// fudaba-public-routes.test.ts
{
    const NOW = Date.now();
    const CREATED_AT = "2026-08-02T00:00:00.000Z";

    class PublicMediaStorage implements ObjectStorage {
        async createPublicReadUrl(key: string): Promise<string | null> {
            return key.startsWith("public/")
                ? `https://media.example.test/${key}`
                : null;
        }
        async get(): Promise<StoredObject | null> {
            return null;
        }
        async put(
            _key: string,
            body: Uint8Array,
            options: PutObjectOptions = {},
        ): Promise<StoredObject> {
            return {
                body,
                size: body.byteLength,
                contentType: options.contentType || "application/octet-stream",
                etag: "unused",
            };
        }
        async delete(): Promise<void> {}
        async exists(): Promise<boolean> {
            return false;
        }
        async copy(): Promise<void> {}
        async move(): Promise<void> {}
        async list(): Promise<ListedObject[]> {
            return [];
        }
        async deletePrefix(): Promise<void> {}
    }

    function publicCard(
        overrides: Partial<FudabaPublicCardRecord> = {},
    ): FudabaPublicCardRecord {
        return {
            id: "card-a",
            producer_name: "Producer A",
            display_name: "Card A",
            series_code: "765",
            favorite_idol: "Haruka",
            favorite_idols: [],
            front_object_key: "public/cards/card-a/front.webp",
            back_object_key: "public/cards/card-a/back.webp",
            accent: "#4f64dd",
            bio: "Public bio",
            trade_note: "Trade note",
            available: true,
            source_url: null,
            source_label: null,
            source_credit: null,
            created_at: CREATED_AT,
            like_count: 2,
            favorite_count: 1,
            viewer_liked: false,
            viewer_favorited: false,
            ...overrides,
        };
    }

    function publicOffice(): FudabaPublicOfficeRecord {
        return {
            id: "office-a",
            slug: "上海-office-a",
            name: "Office A",
            intro: "Public intro",
            city: "Shanghai",
            // pi-lens-ignore: typos
            address: "West Bund Art Center",
            accent: "#ef5b6c",
            cover_object_key: "public/offices/office-a/cover.webp",
            is_open: true,
            visitor_count: 7,
            series_codes: ["765"],
        };
    }

    class PublicFudabaFixture {
        lastOfficeInput: ListFudabaPublicOfficesInput | null = null;
        lastCardInput: ListFudabaPublicCardsInput | null = null;
        officeVisible = true;
        card = publicCard();

        readonly repository = {
            listPublicSeries: async () => [
                {
                    id: 1,
                    code: "765",
                    display_name: "765PRO",
                    color: "#f34f6d",
                    display_order: 0,
                    icon_object_key: "public/agencies/765.webp",
                    image_transform: {
                        fit: "contain" as const,
                        focalX: 0.5,
                        focalY: 0.5,
                        zoom: 1,
                        rotation: 0 as const,
                    },
                    active_office_count: 1,
                },
            ],
            listPublicOffices: async (input: ListFudabaPublicOfficesInput) => {
                this.lastOfficeInput = input;
                const row = {
                    ...publicOffice(),
                    owner_account_id: "must-not-leak",
                    latitude: 31.2,
                    longitude: 121.4,
                };
                return input.limit > 1 ? [row, { ...row, id: "office-b" }] : [row];
            },
            findPublicOfficeBySlug: async (
                _slug: string,
                viewerAccountId: string | null,
            ): Promise<FudabaPublicOfficeDetailRecord | null> => {
                if (!this.officeVisible) return null;
                return {
                    ...publicOffice(),
                    cards: [
                        {
                            ...this.card,
                            viewer_liked: viewerAccountId === "platform-viewer",
                            viewer_favorited: viewerAccountId === "platform-viewer",
                            pinned_at: CREATED_AT,
                            position_x: 50,
                            position_y: 40,
                            rotation: 2,
                            z_index: 3,
                            revision: 4,
                            updated_at: CREATED_AT,
                            viewer_owned: viewerAccountId === "platform-viewer",
                        },
                    ],
                };
            },
            listPublicCards: async (input: ListFudabaPublicCardsInput) => {
                this.lastCardInput = input;
                const row = {
                    ...this.card,
                    viewer_liked: input.viewerAccountId === "platform-viewer",
                    viewer_favorited: input.viewerAccountId === "platform-viewer",
                };
                return input.limit > 1 ? [row, { ...row, id: "card-b" }] : [row];
            },
        } as unknown as FudabaRepository;
    }

    function runtime(
        fudaba: PublicFudabaFixture,
        options: {
            enabled?: boolean;
            accountStatus?: PlatformAccountStatus;
        } = {},
    ): RuntimeServices {
        const status = options.accountStatus ?? "active";
        return {
            fudaba: fudaba.repository,
            storage: new PublicMediaStorage(),
            platformTokens: {
                async sign() {
                    return "valid-platform";
                },
                async verify(token: string) {
                    if (token !== "valid-platform")
                        throw new Error("invalid token");
                    return {
                        iss: "imsweb" as const,
                        aud: "ims-platform" as const,
                        kind: "platform" as const,
                        id: "platform-viewer",
                        tokenVersion: 0,
                        sessionId: "platform-session",
                        csrfSecret: "csrf-secret",
                        jti: "access-token",
                        iat: Math.floor(NOW / 1000),
                        exp: Math.floor(NOW / 1000) + 300,
                    };
                },
            },
            platformAccounts: {
                async findRefreshSessionById() {
                    return {
                        id: "platform-session",
                        account_id: "platform-viewer",
                        token_hash: "hash",
                        previous_token_hash: null,
                        csrf_hash: "csrf-hash",
                        expires_at: NOW + 60_000,
                        created_at: NOW,
                        updated_at: NOW,
                        revoked_at: null,
                    };
                },
                async findAccountWithProfileById() {
                    return {
                        account: {
                            id: "platform-viewer",
                            status,
                            token_version: 0,
                            created_at: NOW,
                            updated_at: NOW,
                            deleted_at: status === "deleted" ? NOW : null,
                        },
                        profile: {
                            account_id: "platform-viewer",
                            display_name: "Platform Viewer",
                            avatar_object_key: null,
                            avatar_external_url: null,
                            home_city: null,
                            bio: "",
                            updated_at: NOW,
                        },
                    };
                },
                async revokeRefreshSession() {
                    return true;
                },
            } as unknown as NonNullable<RuntimeServices["platformAccounts"]>,
            config: { fudabaPublicReadEnabled: options.enabled ?? true },
        };
    }

    test.describe('Fudaba public routes', () => {
        test("Fudaba public read feature gate hides every route by default", async () => {
            const fudaba = new PublicFudabaFixture();
            const app = createTestApp(() => runtime(fudaba, { enabled: false }));
            const response = await testRequest(
                app,
                "/api/community/exchange/series",
            );
            assert.equal(response.status, 404);
            assert.match(response.headers.get("content-type") ?? "", /^text\/plain/i);
            assert.equal(await response.text(), "Not Found");
            assert.equal(response.headers.get("cache-control"), "private, no-store");
        });

        test("Fudaba public series fails closed when icon storage is unavailable", async () => {
            const fudaba = new PublicFudabaFixture();
            const app = createTestApp(() => ({
                ...runtime(fudaba),
                storage: undefined,
            }));

            const response = await testRequest(
                app,
                "/api/community/exchange/series",
            );
            assert.equal(response.status, 503);
            assert.deepEqual(await contractJson(response, fudabaErrorResponseSchema), {
                error: "Internal server error",
            });
        });

        test("anonymous Fudaba discovery exposes only public projections and stable cursors", async () => {
            const fudaba = new PublicFudabaFixture();
            const app = createTestApp(() => runtime(fudaba));
            const seriesResponse = await testRequest(
                app,
                "/api/community/exchange/series",
            );
            assert.equal(seriesResponse.status, 200);
            assert.deepEqual(await contractJson(seriesResponse, fudabaSeriesListSchema), {
                items: [
                    {
                        id: 1,
                        code: "765",
                        displayName: "765PRO",
                        displayOrder: 0,
                        color: "#f34f6d",
                        iconUrl: "https://media.example.test/public/agencies/765.webp",
                        imageTransform: {
                            fit: "contain",
                            focalX: 0.5,
                            focalY: 0.5,
                            zoom: 1,
                            rotation: 0,
                        },
                        activeOfficeCount: 1,
                    },
                ],
            });
            const response = await testRequest(
                app,
                "/api/community/exchange/offices?city=Shanghai&limit=1",
                { headers: { cookie: "ims_admin_access=backoffice-token" } },
            );
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("cache-control"), "private, no-store");
            const body = await contractJson(response, fudabaOfficePageSchema);
            assert.equal(body.pageInfo.hasNextPage, true);
            assert.ok(body.pageInfo.nextCursor);
            assert.equal(
                body.items[0].coverUrl,
                "https://media.example.test/public/offices/office-a/cover.webp",
            );
            // pi-lens-ignore: typos
            assert.equal(body.items[0].address, "West Bund Art Center");
            const serialized = JSON.stringify(body);
            for (const forbidden of [
                "owner_account_id",
                "cover_object_key",
                "latitude",
                "longitude",
            ]) {
                assert.equal(serialized.includes(forbidden), false, forbidden);
            }
            assert.deepEqual(fudaba.lastOfficeInput, {
                city: "Shanghai",
                limit: 2,
            });

            const mismatched = await testRequest(
                app,
                `/api/community/exchange/offices?city=Beijing&limit=1&cursor=${body.pageInfo.nextCursor}`,
            );
            assert.equal(mismatched.status, 400);
        });

        test("valid Platform auth adds viewer flags while Backoffice remains anonymous", async () => {
            const fudaba = new PublicFudabaFixture();
            const app = createTestApp(() => runtime(fudaba));
            const anonymous = await testRequest(
                app,
                "/api/community/exchange/cards",
                {
                    headers: { cookie: "ims_admin_access=backoffice-token" },
                },
            );
            assert.equal(anonymous.status, 200);
            assert.equal(fudaba.lastCardInput?.viewerAccountId, null);

            const authenticated = await testRequest(
                app,
                "/api/community/exchange/cards",
                { headers: { authorization: "Bearer valid-platform" } },
            );
            assert.equal(authenticated.status, 200);
            assert.equal(fudaba.lastCardInput?.viewerAccountId, "platform-viewer");
            const body = await contractJson(authenticated, fudabaCardPageSchema);
            assert.deepEqual(body.items[0].interactions, {
                likes: 2,
                favorites: 1,
                viewerLiked: true,
                viewerFavorited: true,
            });
            assert.equal(JSON.stringify(body).includes("object_key"), false);

            const office = await testRequest(
                app,
                "/api/community/exchange/offices/上海-office-a",
                { headers: { authorization: "Bearer valid-platform" } },
            );
            assert.equal(office.status, 200);
            const officeBody = await contractJson(office, fudabaOfficeDetailSchema);
            assert.equal(officeBody.office.cards[0]?.viewerOwned, true);
            assert.deepEqual(officeBody.office.cards[0]?.placement, {
                pinnedAt: CREATED_AT,
                x: 50,
                y: 40,
                rotation: 2,
                zIndex: 3,
                revision: 4,
                updatedAt: CREATED_AT,
            });
        });

        test("invalid or blocked Platform credentials never downgrade to anonymous", async () => {
            const fudaba = new PublicFudabaFixture();
            const activeApp = createTestApp(() => runtime(fudaba));
            const invalid = await testRequest(
                activeApp,
                "/api/community/exchange/cards",
                { headers: { cookie: `${PLATFORM_ACCESS_TOKEN_COOKIE}=invalid` } },
            );
            assert.equal(invalid.status, 401);

            const suspendedApp = createTestApp(() =>
                runtime(fudaba, {
                    accountStatus: "suspended",
                }),
            );
            const suspended = await testRequest(
                suspendedApp,
                "/api/community/exchange/cards",
                { headers: { authorization: "Bearer valid-platform" } },
            );
            assert.equal(suspended.status, 403);
        });

        test("office visibility, query validation, and public media fail closed", async () => {
            const fudaba = new PublicFudabaFixture();
            const app = createTestApp(() => runtime(fudaba));
            fudaba.officeVisible = false;
            assert.equal(
                (
                    await testRequest(
                        app,
                        "/api/community/exchange/offices/上海-office-a",
                    )
                ).status,
                404,
            );
            assert.equal(
                (
                    await testRequest(
                        app,
                        "/api/community/exchange/offices?bbox=1,2,3,4",
                    )
                ).status,
                400,
            );
            assert.equal(
                (
                    await testRequest(
                        app,
                        "/api/community/exchange/cards?available=yes",
                    )
                ).status,
                400,
            );

            fudaba.card = publicCard({ front_object_key: "private/card-a/front.webp" });
            const unavailable = await testRequest(
                app,
                "/api/community/exchange/cards",
            );
            assert.equal(unavailable.status, 503);
            assert.deepEqual(await contractJson(unavailable, fudabaErrorResponseSchema), {
                error: "Internal server error",
            });
        });

        test("Fudaba public queries reject duplicate, out-of-range, and mismatched cursor input", async () => {
            const fudaba = new PublicFudabaFixture();
            const app = createTestApp(() => runtime(fudaba));
            const multiSeries = await testRequest(
                app,
                "/api/community/exchange/offices" +
                    "?series=765&series=cg&limit=2",
            );
            assert.equal(multiSeries.status, 200);
            await contractJson(multiSeries, fudabaOfficePageSchema);
            assert.deepEqual(fudaba.lastOfficeInput?.seriesCodes, ["765", "cg"]);
            for (const path of [
                "/api/community/exchange/offices?city=Shanghai&city=Beijing",
                "/api/community/exchange/offices?limit=0",
                "/api/community/exchange/offices?limit=51",
                "/api/community/exchange/offices?cursor=not-a-cursor",
                "/api/community/exchange/cards?series=invalid%21",
                "/api/community/exchange/cards?series=765&series=765",
                "/api/community/exchange/cards?office=invalid%2Fslug",
                "/api/community/exchange/offices/invalid_slug",
                "/api/community/exchange/offices/office-a?unexpected=true",
            ]) {
                assert.equal(
                    (await testRequest(app, path)).status,
                    400,
                    path,
                );
            }

            const firstPage = await testRequest(
                app,
                "/api/community/exchange/cards?series=765&limit=1",
            );
            assert.equal(firstPage.status, 200);
            const body = (await firstPage.json()) as {
                pageInfo: { nextCursor: string | null };
            };
            assert.ok(body.pageInfo.nextCursor);
            const mismatch = await testRequest(
                app,
                "/api/community/exchange/cards" +
                    `?series=cg&limit=1&cursor=${body.pageInfo.nextCursor}`,
            );
            assert.equal(mismatch.status, 400);
        });

        test("Fudaba public surface registers no mutation routes", async () => {
            const fudaba = new PublicFudabaFixture();
            const app = createTestApp(() => runtime(fudaba));
            for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
                const response = await testRequest(
                    app,
                    "/api/community/exchange/cards",
                    { method },
                );
                assert.equal(response.status, 404, method);
            }
            const invalidCredentialMutation = await testRequest(
                app,
                "/api/community/exchange/cards",
                {
                    method: "POST",
                    headers: { authorization: "Bearer invalid-platform" },
                },
            );
            assert.equal(invalidCredentialMutation.status, 404);
        });
    });
}
