import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
    fudabaCardInteractionResponseSchema,
    fudabaCardPageSchema
} from '@imsweb/contracts/fudaba';
import { createHonoApp } from '@/app';
import {
    PLATFORM_ACCESS_TOKEN_COOKIE,
    PLATFORM_CSRF_TOKEN_COOKIE
} from '@/domains/identity/platform-auth/contracts/session';
import type { RateLimiter } from '@/ports/cache';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';
import type {
    FudabaCardInteractionStateRecord,
    FudabaPublicCardRecord,
    FudabaRepository,
    ListFudabaPublicCardsInput,
    PlatformAccountStatus
} from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';

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
                              csrf_hash: createHash('sha256')
                                  .update(CSRF)
                                  .digest('hex'),
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
    return { authorization: `Bearer ${TOKEN}` };
}

function cookieHeaders(includeCsrfHeader: boolean): Record<string, string> {
    return {
        cookie:
            `${PLATFORM_ACCESS_TOKEN_COOKIE}=${TOKEN}; ` +
            `${PLATFORM_CSRF_TOKEN_COOKIE}=${CSRF}`,
        ...(includeCsrfHeader ? { 'x-csrftoken': CSRF } : {})
    };
}

function interactionPath(kind: 'like' | 'favorite', cardId = CARD_ID): string {
    return `http://ims.test/api/community/exchange/cards/${cardId}/${kind}`;
}

test('card interaction routes enforce the write gate, auth, CSRF, and rate limit',
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
        const likedBody = await liked.json();
        fudabaCardInteractionResponseSchema.parse(likedBody);
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
        assert.deepEqual(await unliked.json(), {
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
        assert.deepEqual(await missing.json(), {
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
        const body = await collection.json() as {
            items: Record<string, unknown>[];
        };
        fudabaCardPageSchema.parse(body);
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
