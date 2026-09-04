/**
 * Shared Platform owner-route fixture.
 *
 * Stubs the Platform account, Fudaba, storage, upload, image, and rate-limit
 * ports behind a real Hono app so route-level tests can exercise owner reads,
 * owner writes, and Platform profile boundaries without touching PostgreSQL.
 */
import { createHash } from 'node:crypto';
import { createHonoApp } from '@/app';
import {
    PLATFORM_ACCESS_TOKEN_COOKIE,
    PLATFORM_CSRF_TOKEN_COOKIE
} from '@/domains/identity/platform-auth/contracts/session';
import type { RateLimiter } from '@/ports/cache';
import type {
    ParsedUpload,
    UploadParser,
    UploadedFile
} from '@/ports/http';
import type { ImageInfo, ImageProcessor } from '@/ports/media';
import type {
    CompensationService,
    ListedObject,
    ObjectReadTarget,
    ObjectReadUrlOptions,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';
import type {
    CreateOwnedFudabaCardInput,
    FudabaCardMutationResult,
    FudabaCardRecord,
    FudabaRepository,
    PlatformAccountRepository,
    PlatformAccountStatus,
    PlatformProfileRecord,
    SoftDeleteOwnedFudabaCardInput,
    UpdateOwnedFudabaCardMediaInput,
    UpdateOwnedFudabaCardMetadataInput,
    UpdatePlatformProfileAvatarInput,
    UpdatePlatformProfileTextInput
} from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';

export const ACCOUNT_ID = 'platform-owner';
export const OTHER_ACCOUNT_ID = 'platform-other';
export const PLATFORM_TOKEN = 'valid-platform-token';
export const BACKOFFICE_TOKEN = 'valid-backoffice-token';
export const CSRF_SECRET = 'owner-csrf-secret';
export const CREATED_AT = '2026-08-02T00:00:00.000Z';
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

export function csrfHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function uploadedFile(
    filename: string,
    contentType: string,
    body: Uint8Array
): UploadedFile {
    return { filename, contentType, body };
}

export function ownerCard(overrides: Partial<FudabaCardRecord> = {}): FudabaCardRecord {
    return {
        id: 'owner-card',
        owner_account_id: ACCOUNT_ID,
        producer_name: 'Owner Producer',
        display_name: 'Owner Card',
        series_code: '765',
        favorite_idol: 'Haruka',
        favorite_idols: [],
        legacy_card_id: null,
        front_object_key: 'protected/fudaba/cards/owner-card/front.webp',
        back_object_key: 'protected/fudaba/cards/owner-card/back.webp',
        accent: '#4f64dd',
        bio: 'Owner bio',
        trade_note: 'Owner trade note',
        available: true,
        source_url: null,
        source_label: null,
        source_credit: null,
        media_rights_status: 'unknown',
        publication_status: 'pending',
        revision: 1,
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
        deleted_at: null,
        ...overrides
    };
}

export function cardFields(): Record<string, string> {
    return {
        producerName: 'New Producer',
        displayName: 'New Card',
        seriesCode: '765',
        favoriteIdolIds: '[900001]',
        accent: '#336699',
        bio: 'New bio',
        tradeNote: 'New trade note',
        available: 'true'
    };
}

export function cardUpload(
    front: UploadedFile = uploadedFile('front.jpg', 'image/jpeg', JPEG_BYTES),
    back: UploadedFile = uploadedFile('back.png', 'image/png', PNG_BYTES)
): ParsedUpload {
    return {
        fields: cardFields(),
        files: { front, back }
    };
}

export function mediaUpload(
    fields: Record<string, string>,
    file: UploadedFile = uploadedFile('image.jpg', 'image/jpeg', JPEG_BYTES)
): ParsedUpload {
    return { fields, files: { image: file } };
}

export class ControlledUploadParser implements UploadParser {
    next: ParsedUpload = cardUpload();
    readonly calls: Array<Parameters<UploadParser['parse']>[1]> = [];

    async parse(
        _request: Request,
        options: Parameters<UploadParser['parse']>[1]
    ): Promise<ParsedUpload> {
        this.calls.push(options);
        return this.next;
    }
}

export class SniffingImageProcessor implements ImageProcessor {
    readonly validations: Array<{ body: Uint8Array; declaredType?: string }> = [];
    readonly conversions: Uint8Array[] = [];

    async validate(body: Uint8Array, declaredType?: string): Promise<ImageInfo> {
        this.validations.push({ body, declaredType });
        if (body[0] === 0xff) {
            return {
                format: 'jpeg',
                width: 1200,
                height: 800,
                contentType: 'image/jpeg'
            };
        }
        if (body[0] === 0x89) {
            return {
                format: 'png',
                width: 800,
                height: 1200,
                contentType: 'image/png'
            };
        }
        if (body[0] === 0x52) {
            return {
                format: 'webp',
                width: 1000,
                height: 1000,
                contentType: 'image/webp'
            };
        }
        throw new Error('undecodable image');
    }

    async toWebp(body: Uint8Array): Promise<Uint8Array> {
        this.conversions.push(body);
        return new Uint8Array([0x52, 0x49, 0x46, 0x46, body[0] ?? 0]);
    }

    async thumbnailPng(): Promise<Uint8Array> {
        throw new Error('unused');
    }

    async resizeJpeg(): Promise<Uint8Array> {
        throw new Error('unused');
    }
}

export interface MemoryObject {
    stored: StoredObject;
    options: PutObjectOptions;
}

export class ProtectedMemoryStorage implements ObjectStorage {
    readonly objects = new Map<string, MemoryObject>();
    readonly puts: Array<{
        key: string;
        body: Uint8Array;
        options: PutObjectOptions;
    }> = [];
    readonly deletes: string[] = [];
    readonly ownedDeletes: Array<{ key: string; ownerToken: string }> = [];
    readonly readUrls: Array<{ key: string; method?: 'GET' | 'HEAD' }> = [];
    readonly failDeletes = new Set<string>();
    failPutNumber: number | null = null;

    seed(key: string, body = new Uint8Array([0x52, 0x49, 0x46, 0x46])): void {
        this.objects.set(key, {
            stored: {
                body,
                size: body.byteLength,
                contentType: 'image/webp',
                etag: `seed-${key}`
            },
            options: { contentType: 'image/webp', protectedAccess: true }
        });
    }

    async get(key: string): Promise<StoredObject | null> {
        return this.objects.get(key)?.stored ?? null;
    }

    async createReadUrl(
        key: string,
        options?: ObjectReadUrlOptions
    ): Promise<ObjectReadTarget | null> {
        this.readUrls.push({ key, method: options?.method });
        return this.objects.has(key)
            ? {
                url: `https://private-media.example.test/${encodeURIComponent(key)}?signed=1`,
                visibility: 'private'
            }
            : null;
    }

    async put(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject> {
        this.puts.push({ key, body, options });
        if (this.failPutNumber === this.puts.length) {
            throw new Error('object write failed');
        }
        const stored = {
            body,
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: `etag-${this.puts.length}`
        };
        this.objects.set(key, { stored, options });
        return stored;
    }

    async delete(key: string): Promise<void> {
        this.deletes.push(key);
        if (this.failDeletes.has(key)) throw new Error('object delete failed');
        this.objects.delete(key);
    }

    async deleteIfOwned(key: string, ownerToken: string): Promise<boolean> {
        this.ownedDeletes.push({ key, ownerToken });
        const object = this.objects.get(key);
        if (!object || object.options.ownerToken !== ownerToken) return false;
        this.objects.delete(key);
        return true;
    }

    async exists(key: string): Promise<boolean> {
        return this.objects.has(key);
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const object = this.objects.get(sourceKey);
        if (!object) throw new Error('missing source');
        this.objects.set(destinationKey, object);
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
                size: value.stored.size,
                etag: value.stored.etag
            }));
    }

    async deletePrefix(prefix: string): Promise<void> {
        for (const key of [...this.objects.keys()]) {
            if (key.startsWith(prefix)) this.objects.delete(key);
        }
    }
}

export class RecordingCompensation implements CompensationService {
    readonly enqueued: Array<{ kind: string; payload: unknown; error?: unknown }> = [];

    async enqueue(kind: string, payload: unknown, error?: unknown): Promise<string> {
        this.enqueued.push({ kind, payload, error });
        return `compensation-${this.enqueued.length}`;
    }

    async run(): Promise<void> {}
}

export class ControlledRateLimiter implements RateLimiter {
    readonly deniedBuckets = new Set<string>();
    readonly calls: Array<{ bucket: string; key: string; limit: number }> = [];

    async consume(
        bucket: string,
        key: string,
        limit: number
    ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
        this.calls.push({ bucket, key, limit });
        const allowed = !this.deniedBuckets.has(bucket);
        return {
            allowed,
            remaining: allowed ? Math.max(0, limit - 1) : 0,
            resetAt: Date.now() + 60_000
        };
    }
}

export interface FixtureOptions {
    accountStatus?: PlatformAccountStatus;
    publicReadEnabled?: boolean;
    writeEnabled?: boolean;
}

export class OwnerRouteFixture {
    accountStatus: PlatformAccountStatus;
    publicReadEnabled: boolean;
    writeEnabled: boolean;
    profile: PlatformProfileRecord = {
        account_id: ACCOUNT_ID,
        display_name: 'Owner Display',
        avatar_object_key: null,
        avatar_external_url: null,
        home_city: 'Shanghai',
        bio: 'Profile bio',
        updated_at: 1_000
    };
    readonly session = {
        id: 'platform-session',
        account_id: ACCOUNT_ID,
        token_hash: 'refresh-hash',
        previous_token_hash: null,
        csrf_hash: csrfHash(CSRF_SECRET),
        expires_at: Date.now() + 60 * 60 * 1000,
        created_at: Date.now(),
        updated_at: Date.now(),
        revoked_at: null as number | null
    };
    readonly cards = new Map<string, FudabaCardRecord>();
    readonly uploads = new ControlledUploadParser();
    readonly images = new SniffingImageProcessor();
    readonly storage = new ProtectedMemoryStorage();
    readonly compensation = new RecordingCompensation();
    readonly rateLimiter = new ControlledRateLimiter();
    createMode: 'saved' | 'unavailable' | 'throw' | 'mutate-then-throw' = 'saved';
    updateAvatarMode: 'saved' | 'mutate-then-throw' = 'saved';
    updateMediaMode:
        | 'saved'
        | 'unavailable'
        | 'conflict'
        | 'throw'
        | 'mutate-then-throw' = 'saved';
    failCardConfirmationRead = false;
    failProfileConfirmationRead = false;
    private cardMutationCommitted = false;
    private profileMutationCommitted = false;
    readonly createInputs: CreateOwnedFudabaCardInput[] = [];
    readonly metadataInputs: UpdateOwnedFudabaCardMetadataInput[] = [];
    readonly mediaInputs: UpdateOwnedFudabaCardMediaInput[] = [];
    readonly deleteInputs: SoftDeleteOwnedFudabaCardInput[] = [];
    readonly profileTextInputs: UpdatePlatformProfileTextInput[] = [];
    readonly profileAvatarInputs: UpdatePlatformProfileAvatarInput[] = [];
    readonly app: ReturnType<typeof createHonoApp>;

    constructor(options: FixtureOptions = {}) {
        this.accountStatus = options.accountStatus ?? 'active';
        this.publicReadEnabled = options.publicReadEnabled ?? true;
        this.writeEnabled = options.writeEnabled ?? true;
        const card = ownerCard();
        const other = ownerCard({
            id: 'other-card',
            owner_account_id: OTHER_ACCOUNT_ID,
            front_object_key: 'protected/fudaba/cards/other-card/front.webp',
            back_object_key: 'protected/fudaba/cards/other-card/back.webp'
        });
        this.cards.set(card.id, card);
        this.cards.set(other.id, other);
        this.storage.seed(card.front_object_key);
        this.storage.seed(card.back_object_key);
        this.storage.seed(other.front_object_key);
        this.storage.seed(other.back_object_key);
        this.app = createHonoApp(() => this.runtime());
    }

    private identity() {
        return {
            account: {
                id: ACCOUNT_ID,
                status: this.accountStatus,
                token_version: 0,
                created_at: 500,
                updated_at: 500,
                deleted_at: this.accountStatus === 'deleted' ? 500 : null
            },
            profile: { ...this.profile }
        };
    }

    readonly platformAccounts = {
        findRefreshSessionById: async (id: string) =>
            id === this.session.id ? { ...this.session } : null,
        findAccountWithProfileById: async (id: string) => {
            if (this.profileMutationCommitted && this.failProfileConfirmationRead) {
                throw new Error('profile confirmation read failed');
            }
            return id === ACCOUNT_ID ? this.identity() : null;
        },
        updateProfileTextForOwner: async (input: UpdatePlatformProfileTextInput) => {
            this.profileTextInputs.push(input);
            if (this.accountStatus !== 'active') return { status: 'unavailable' as const };
            if (input.expectedUpdatedAt !== this.profile.updated_at) {
                return {
                    status: 'conflict' as const,
                    updatedAt: this.profile.updated_at
                };
            }
            this.profile = {
                ...this.profile,
                display_name: input.displayName,
                home_city: input.homeCity,
                bio: input.bio,
                updated_at: input.updatedAt
            };
            return {
                status: 'saved' as const,
                profile: { ...this.profile },
                previousAvatarObjectKey: this.profile.avatar_object_key
            };
        },
        updateProfileAvatarForOwner: async (input: UpdatePlatformProfileAvatarInput) => {
            this.profileAvatarInputs.push(input);
            if (this.accountStatus !== 'active') return { status: 'unavailable' as const };
            if (input.expectedUpdatedAt !== this.profile.updated_at) {
                return {
                    status: 'conflict' as const,
                    updatedAt: this.profile.updated_at
                };
            }
            const previousAvatarObjectKey = this.profile.avatar_object_key;
            this.profile = {
                ...this.profile,
                avatar_object_key: input.avatarObjectKey,
                avatar_external_url: null,
                updated_at: input.updatedAt
            };
            if (this.updateAvatarMode === 'mutate-then-throw') {
                this.profileMutationCommitted = true;
                throw new Error('profile connection lost after commit');
            }
            return {
                status: 'saved' as const,
                profile: { ...this.profile },
                previousAvatarObjectKey
            };
        },
        revokeRefreshSession: async () => true
    } as unknown as PlatformAccountRepository;

    readonly fudaba = {
        listPublicSeries: async () => [{
            id: 1,
            code: '765',
            display_name: '765PRO',
            color: '#f34f6d',
            display_order: 0,
            icon_object_key: null,
            image_transform: {
                fit: 'contain' as const,
                focalX: 0.5,
                focalY: 0.5,
                zoom: 1,
                rotation: 0 as const
            },
            active_office_count: 0
        }],
        listPublicOffices: async () => [],
        findPublicOfficeBySlug: async () => null,
        listPublicCards: async () => [],
        listCardsForOwner: async (ownerAccountId: string) =>
            [...this.cards.values()].filter((card) =>
                card.owner_account_id === ownerAccountId && card.deleted_at === null
            ),
        findCardForOwner: async (cardId: string, ownerAccountId: string) => {
            if (this.cardMutationCommitted && this.failCardConfirmationRead) {
                throw new Error('card confirmation read failed');
            }
            const card = this.cards.get(cardId);
            return card?.owner_account_id === ownerAccountId && card.deleted_at === null
                ? { ...card }
                : null;
        },
        createCardForOwner: async (
            input: CreateOwnedFudabaCardInput
        ): Promise<FudabaCardMutationResult> => {
            this.createInputs.push(input);
            if (this.createMode === 'throw') throw new Error('repository write failed');
            if (this.createMode === 'unavailable') return { status: 'unavailable' };
            const card = ownerCard({
                id: input.id,
                owner_account_id: input.ownerAccountId,
                producer_name: input.producerName,
                display_name: input.displayName,
                series_code: input.seriesCode,
                favorite_idol: input.favoriteIdol,
                front_object_key: input.frontObjectKey,
                back_object_key: input.backObjectKey,
                accent: input.accent,
                bio: input.bio,
                trade_note: input.tradeNote,
                available: input.available,
                revision: 0,
                created_at: input.createdAt,
                updated_at: input.updatedAt
            });
            this.cards.set(card.id, card);
            if (this.createMode === 'mutate-then-throw') {
                this.cardMutationCommitted = true;
                throw new Error('card connection lost after commit');
            }
            return { status: 'saved', card: { ...card }, previousObjectKey: null };
        },
        updateCardMetadataForOwner: async (
            input: UpdateOwnedFudabaCardMetadataInput
        ): Promise<FudabaCardMutationResult> => {
            this.metadataInputs.push(input);
            const current = this.cards.get(input.cardId);
            if (
                !current || current.owner_account_id !== input.ownerAccountId ||
                current.deleted_at !== null || this.accountStatus !== 'active'
            ) {
                return { status: 'unavailable' };
            }
            if (current.revision !== input.expectedRevision) {
                return { status: 'conflict', revision: current.revision };
            }
            const card = {
                ...current,
                producer_name: input.producerName,
                display_name: input.displayName,
                series_code: input.seriesCode,
                favorite_idol: input.favoriteIdol,
                accent: input.accent,
                bio: input.bio,
                trade_note: input.tradeNote,
                available: input.available,
                media_rights_status: 'unknown' as const,
                publication_status: 'pending' as const,
                revision: current.revision + 1,
                updated_at: input.updatedAt
            };
            this.cards.set(card.id, card);
            return { status: 'saved', card: { ...card }, previousObjectKey: null };
        },
        updateCardMediaForOwner: async (
            input: UpdateOwnedFudabaCardMediaInput
        ): Promise<FudabaCardMutationResult> => {
            this.mediaInputs.push(input);
            if (this.updateMediaMode === 'throw') throw new Error('media repository failed');
            const current = this.cards.get(input.cardId);
            if (
                this.updateMediaMode === 'unavailable' || !current ||
                current.owner_account_id !== input.ownerAccountId ||
                current.deleted_at !== null || this.accountStatus !== 'active'
            ) {
                return { status: 'unavailable' };
            }
            if (
                this.updateMediaMode === 'conflict' ||
                current.revision !== input.expectedRevision
            ) {
                return { status: 'conflict', revision: current.revision };
            }
            const property = input.side === 'front'
                ? 'front_object_key' as const
                : 'back_object_key' as const;
            const previousObjectKey = current[property];
            const card = {
                ...current,
                [property]: input.objectKey,
                media_rights_status: 'unknown' as const,
                publication_status: 'pending' as const,
                revision: current.revision + 1,
                updated_at: input.updatedAt
            };
            this.cards.set(card.id, card);
            if (this.updateMediaMode === 'mutate-then-throw') {
                this.cardMutationCommitted = true;
                throw new Error('media connection lost after commit');
            }
            return { status: 'saved', card: { ...card }, previousObjectKey };
        },
        softDeleteCardForOwner: async (
            input: SoftDeleteOwnedFudabaCardInput
        ): Promise<FudabaCardMutationResult> => {
            this.deleteInputs.push(input);
            const current = this.cards.get(input.cardId);
            if (
                !current || current.owner_account_id !== input.ownerAccountId ||
                current.deleted_at !== null || this.accountStatus !== 'active'
            ) {
                return { status: 'unavailable' };
            }
            if (current.revision !== input.expectedRevision) {
                return { status: 'conflict', revision: current.revision };
            }
            const card = {
                ...current,
                revision: current.revision + 1,
                deleted_at: input.deletedAt,
                updated_at: input.deletedAt
            };
            this.cards.set(card.id, card);
            return { status: 'saved', card: { ...card }, previousObjectKey: null };
        }
    } as unknown as FudabaRepository;

    runtime(): RuntimeServices {
        return {
            fudaba: this.fudaba,
            platformAccounts: this.platformAccounts,
            uploads: this.uploads,
            images: this.images,
            storage: this.storage,
            compensation: this.compensation,
            rateLimiter: this.rateLimiter,
            platformTokens: {
                async sign() { return PLATFORM_TOKEN; },
                async verify(token: string) {
                    if (token !== PLATFORM_TOKEN) throw new Error('wrong token realm');
                    const now = Math.floor(Date.now() / 1000);
                    return {
                        iss: 'imsweb' as const,
                        aud: 'ims-platform' as const,
                        kind: 'platform' as const,
                        id: ACCOUNT_ID,
                        tokenVersion: 0,
                        sessionId: 'platform-session',
                        csrfSecret: CSRF_SECRET,
                        jti: 'platform-access',
                        iat: now,
                        exp: now + 900
                    };
                }
            },
            backofficeTokens: {
                async sign() { return BACKOFFICE_TOKEN; },
                async verify(token: string) {
                    if (token !== BACKOFFICE_TOKEN) throw new Error('invalid');
                    return {
                        iss: 'imsweb' as const,
                        aud: 'ims-backoffice' as const,
                        kind: 'backoffice' as const,
                        id: 1,
                        username: 'admin',
                        producername: 'Admin',
                        dept: 'op',
                        csrfSecret: 'admin-csrf'
                    };
                }
            },
            config: {
                fudabaPublicReadEnabled: this.publicReadEnabled,
                fudabaWriteEnabled: this.writeEnabled
            }
        };
    }
}

export function bearerHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${PLATFORM_TOKEN}`, ...extra };
}

export function cookieHeaders(
    csrfHeader: string | null = CSRF_SECRET,
    csrfCookie = CSRF_SECRET
): Record<string, string> {
    return {
        cookie: `${PLATFORM_ACCESS_TOKEN_COOKIE}=${PLATFORM_TOKEN}; ` +
            `${PLATFORM_CSRF_TOKEN_COOKIE}=${csrfCookie}`,
        ...(csrfHeader === null ? {} : { 'x-csrftoken': csrfHeader })
    };
}

export function profileBody(expectedUpdatedAt: number): Record<string, unknown> {
    return {
        displayName: 'Updated Owner',
        homeCity: 'Beijing',
        bio: 'Updated profile bio',
        expectedUpdatedAt
    };
}

export function metadataBody(expectedRevision: number): Record<string, unknown> {
    return {
        producerName: 'Updated Producer',
        displayName: 'Updated Card',
        seriesCode: '765',
        favoriteIdolIds: [900001],
        accent: '#112233',
        bio: 'Updated card bio',
        tradeNote: 'Updated card trade note',
        available: false,
        expectedRevision
    };
}

export async function postCard(fixture: OwnerRouteFixture): Promise<Response> {
    return fixture.app.request('http://ims.test/api/community/exchange/cards', {
        method: 'POST',
        headers: bearerHeaders(),
        body: new FormData()
    });
}