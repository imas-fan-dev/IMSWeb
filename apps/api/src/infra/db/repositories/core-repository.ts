import {
    adminExchangePath,
    adminNamecardMediaPath,
    namecardMediaPath
} from '@imsweb/contracts/paths';
import {
    NAMECARD_ACCENT_FALLBACK,
    NAMECARD_FAVORITE_CHARACTER_LIMIT,
} from '@imsweb/contracts/fudaba/runtime';
import {
    insertNamecardNotification,
    SqlNamecardNotificationRepository
} from '@/infra/db/repositories/namecard-notification-repository';
import {
    cardAdminEditedCopy,
    cardApprovedCopy,
    cardLockedCopy,
    cardRejectedCopy,
    cardRevisionFlaggedCopy,
    cardRevisionRejectedCopy,
    cardTransferredInCopy,
    cardTransferredOutCopy,
    cardUnlockedCopy,
} from '@/infra/db/repositories/namecard-notification-copy';
import type {
    CardFavoriteSelectionRecord,
    CardMediaRecord,
    FudabaCardCredit,
    NamecardRepository,
    NamecardApprovalClaim,
    NamecardEditResult,
    NamecardMutationResult,
    NamecardAdminContent,
    NamecardAdminDeleteResult,
    NamecardAdminFieldChange,
    NamecardAdminFilter,
    NamecardAdminUpdateInput,
    NamecardAdminUpdateResult,
    NamecardDiffRecord,
    NamecardDiffSide,
    NamecardPublicRecord,
    NamecardSubmissionKind,
    NamecardSubmissionRecord,
    NamecardSubmissionWithHashesRecord,
    PendingCardInput
} from '@/ports/repositories';
import type {
    ManagedSqlDatabase,
    SqlDatabase,
    SqlSchemaStrategy
} from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';
import {
    namecardOriginalUrlFromObjectKey,
    publicMediaObjectKey
} from '@/utils/storage/business-object-keys';
import {
    NAMECARD_COMPAT_ORIGIN,
    NAMECARD_PUBLIC_ORIGIN
} from '@/infra/db/repositories/namecard-origins';

type NamecardSubmissionRow = Omit<NamecardSubmissionRecord, 'favorite_characters'>;

type NamecardFavoriteRow = {
    card_id: number | string;
    character_id: number | string;
    agency_code: string;
    name_cn: string;
    display_order: number | string;
};


const NAMECARD_COLUMNS = `id AS internal_id, card_number, front_object_key,
    back_object_key, publication_status, revision, origin,
    producer_name, producer_reading, group_name, made_on, lock_reason, created_at,
    review_status, review_reason, pending_payload, pending_front_object_key,
    pending_middle_object_keys, pending_back_object_key,
    bio, trade_note, is_original, made_with_ai, visible, exchange_mode, accent,
    owner_account_id`;

function namecardAdminWhere(
    filter?: NamecardAdminFilter
): { sql: string; values: unknown[] } {
    // Withdrawn submissions are gone from the submitter's side, so they never
    // enter the queue; rejected ones stay visible so they can be inspected.
    const clauses = [
        "publication_status <> 'withdrawn'",
        'deleted_at IS NULL'
    ];
    const values: unknown[] = [];
    if (filter?.status === 'pending') {
        // A revision of a published card waits in the same queue while the
        // live copy stays online.
        clauses.push(
            "(publication_status IN ('pending','approving') OR review_status = 'pending')"
        );
    } else if (filter?.status === 'published') {
        clauses.push("publication_status = 'published'");
    } else if (filter?.status === 'rejected') {
        clauses.push(
            "(publication_status = 'rejected' OR review_status IN ('rejected','locked'))"
        );
    } else if (filter?.status === 'locked') {
        clauses.push("publication_status = 'locked'");
    } else if (filter?.status === 'hidden') {
        clauses.push("publication_status = 'hidden'");
    }
    if (filter !== undefined && filter.origins.length > 0) {
        clauses.push(`origin IN (${filter.origins.map(() => '?').join(', ')})`);
        values.push(...filter.origins);
    }
    if (filter !== undefined && filter.query !== null && filter.query !== '') {
        const pattern = `%${filter.query.replace(/[\\%_]/g, '\\$&')}%`;
        clauses.push(
            "(COALESCE(producer_name, '') ILIKE ? ESCAPE '\\' OR COALESCE(producer_reading, '') ILIKE ? ESCAPE '\\')"
        );
        values.push(pattern, pattern);
    }
    return { sql: clauses.join(' AND '), values };
}

type NamecardCardRow = {
    internal_id: string;
    card_number: number | string;
    front_object_key: string;
    back_object_key: string | null;
    publication_status: string;
    revision: number | string;
    series_code: string | null;
    origin: string;
    producer_name?: string | null;
    producer_reading?: string | null;
    group_name?: string | null;
    made_on?: string | null;
    lock_reason?: string | null;
    review_status?: string | null;
    review_reason?: string | null;
    pending_payload?: unknown;
    pending_front_object_key?: string | null;
    pending_middle_object_keys?: string[] | null;
    bio?: string | null;
    trade_note?: string | null;
    is_original?: boolean | null;
    made_with_ai?: boolean | null;
    visible?: boolean | null;
    exchange_mode?: string | null;
    accent?: string | null;
    owner_account_id?: string | null;
    pending_back_object_key?: string | null;
    review_submitted_at?: string | Date | null;
    created_at: string | Date | null;
};

// A revision waiting for review keeps the live columns untouched; reviewers and
// the owner both read the submitted copy through this projection instead.
type NamecardPendingPayload = {
    producer_name?: string | null;
    producer_reading?: string | null;
    bio?: string | null;
    trade_note?: string | null;
    credits?: FudabaCardCredit[];
    series_codes?: string[];
    group_name?: string | null;
    made_on?: string | null;
    is_original?: boolean;
    made_with_ai?: boolean;
    visible?: boolean;
    exchange_mode?: string;
    favorite_character_ids?: number[];
};

function pendingNamecardPayload(value: unknown): NamecardPendingPayload | null {
    if (!value) return null;
    if (typeof value === 'string') {
        try {
            const parsed: unknown = JSON.parse(value);
            return parsed && typeof parsed === 'object'
                ? (parsed as NamecardPendingPayload)
                : null;
        } catch {
            return null;
        }
    }
    return typeof value === 'object' ? (value as NamecardPendingPayload) : null;
}

const NAMECARD_ADMIN_STATUS_LABELS: Record<string, string> = {
    draft: '草稿',
    pending: '待审核',
    approving: '审核中',
    published: '已通过',
    hidden: '已隐藏',
    rejected: '已驳回',
    withdrawn: '已撤回',
    locked: '已锁定'
};

const NAMECARD_ADMIN_REVIEW_LABELS: Record<string, string> = {
    none: '无待审版本',
    pending: '待审',
    rejected: '复审驳回',
    locked: '违规锁定'
};

const NAMECARD_ADMIN_EXCHANGE_LABELS: Record<string, string> = {
    auto: '自动允许',
    manual: '手动允许',
    none: '不可交换'
};

// The admin queue speaks the same vocabulary as the database: a card that went
// live is `published`. The intermediate `approving` lock only exists for the
// two-phase approval, so it surfaces as `pending` instead of leaking out.
function toLegacyNamecardStatus(status: string): NamecardSubmissionRecord['status'] {
    // The public routes still speak the legacy vocabulary: `published` serves as
    // `approved`, and the approval lock reads as `pending`.
    const normalized =
        status === 'published' ? 'approved' : status === 'approving' ? 'pending' : status;
    return normalized as NamecardSubmissionRecord['status'];
}

/** Verdict of the submitted revision, independent of the live publication. */
function toNamecardReviewStatus(
    status: string | null | undefined
): 'pending' | 'rejected' | 'locked' | null {
    return status === 'pending' || status === 'rejected' || status === 'locked'
        ? status
        : null;
}

function exchangeReviewMediaUrl(key: string, side: 'front' | 'back'): string {
    const match = /^community\/fudaba\/cards\/([^/]+)\//.exec(key);
    if (!match) throw new Error(`Unsupported exchange card object key: ${key}`);
    return `${adminExchangePath()}/card-reviews/${match[1]}/media/${side}`;
}

export class SqlCoreRepository implements NamecardRepository {
    private initialized?: Promise<void>;

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly schema: SqlSchemaStrategy
    ) {}

    initialize(): Promise<void> {
        this.initialized ??= this.schema.initializeCore(this.database);
        return this.initialized;
    }

    close(): Promise<void> {
        return this.database.close();
    }

    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null> {
        return queryOne(this.database,
            `SELECT card.card_number AS id
             FROM namecard_guest_attributes guest
             JOIN fudaba_cards card ON card.id=guest.card_id
             WHERE guest.hash1=? AND guest.hash2=?
               AND card.publication_status NOT IN ('withdrawn','rejected')`,
            [hash1, hash2]
        );
    }

    private async validateNamecardSelection(
        database: SqlDatabase,
        seriesCode: string | null,
        characterIds: readonly number[],
        submissionKind: NamecardSubmissionKind
    ): Promise<CardFavoriteSelectionRecord[]> {
        if (submissionKind === 'guest' && !seriesCode) {
            throw new Error('Guest namecard submissions require a series code');
        }
        if (
            submissionKind === 'guest' &&
            (characterIds.length < 1 ||
                characterIds.length > NAMECARD_FAVORITE_CHARACTER_LIMIT)
        ) {
            throw new Error(
                `Guest namecard submissions require between 1 and ${NAMECARD_FAVORITE_CHARACTER_LIMIT} characters`
            );
        }
        if (
            characterIds.length > NAMECARD_FAVORITE_CHARACTER_LIMIT ||
            new Set(characterIds).size !== characterIds.length
        ) {
            throw new Error(
                `Namecard character selections must be unique and contain at most ${NAMECARD_FAVORITE_CHARACTER_LIMIT} characters`
            );
        }
        if (seriesCode) {
            const series = await queryOne<{ code: string }>(
                database,
                'SELECT code FROM agencies WHERE code=?',
                [seriesCode]
            );
            if (!series) throw new Error('Namecard series does not exist');
        }
        if (!characterIds.length) return [];
        const placeholders = characterIds.map(() => '?').join(', ');
        const rows = await queryAll<Omit<NamecardFavoriteRow, 'card_id' | 'display_order'>>(
            database,
            `SELECT character.id AS character_id, agency.code AS agency_code, character.name_cn
             FROM namecard_characters character
             JOIN agencies agency ON agency.id=character.agency_id
             WHERE character.id IN (${placeholders}) AND character.deleted_at IS NULL`,
            characterIds
        );
        const byId = new Map(rows.map((row) => [Number(row.character_id), row]));
        if (byId.size !== characterIds.length) {
            throw new Error('One or more selected namecard characters do not exist');
        }
        return characterIds.map((characterId, displayOrder) => {
            const character = byId.get(characterId)!;
            return {
                character_id: characterId,
                agency_code: character.agency_code,
                name_cn: character.name_cn,
                display_order: displayOrder
            };
        });
    }

    private async listNamecardFavorites(
        database: SqlDatabase,
        internalIds: readonly string[]
    ): Promise<Map<string, CardFavoriteSelectionRecord[]>> {
        const grouped = new Map<string, CardFavoriteSelectionRecord[]>();
        for (const internalId of internalIds) grouped.set(internalId, []);
        if (!internalIds.length) return grouped;
        const placeholders = internalIds.map(() => '?').join(', ');
        const rows = await queryAll<NamecardFavoriteRow>(
            database,
            `SELECT selected.card_id, selected.character_id, agency.code AS agency_code,
                    character.name_cn, selected.display_order
             FROM fudaba_card_favorite_characters selected
             JOIN namecard_characters character ON character.id=selected.character_id
             JOIN agencies agency ON agency.id=character.agency_id
             WHERE selected.card_id IN (${placeholders})
             ORDER BY selected.card_id, selected.display_order`,
            internalIds
        );
        for (const row of rows) {
            grouped.get(String(row.card_id))?.push({
                character_id: Number(row.character_id),
                agency_code: row.agency_code,
                name_cn: row.name_cn,
                display_order: Number(row.display_order)
            });
        }
        return grouped;
    }

    /**
     * Artwork URLs are derived from the object key when the layout is
     * reversible. Editor uploads and older imports are not, so those pages are
     * served through the card media routes instead of failing the whole list.
     */
    private namecardMediaUrl(
        row: NamecardCardRow,
        key: string | null,
        side: 'front' | 'back',
        content: 'live' | 'submission'
    ): string | null {
        if (key === null) return null;
        try {
            return row.origin === 'exchange' && !key.startsWith('community/namecards/assets/')
                ? exchangeReviewMediaUrl(key, side)
                : namecardOriginalUrlFromObjectKey(key);
        } catch {
            const variant = row.review_status === 'pending' ? 'draft' : 'live';
            const cardNumber = Number(row.card_number);
            return content === 'submission'
                ? adminNamecardMediaPath(cardNumber, variant, side)
                : namecardMediaPath(cardNumber, side);
        }
    }

    private namecardRecordFromRow(
        row: NamecardCardRow,
        /** `live` serves the published copy; `submission` serves the queue. */
        content: 'live' | 'submission' = 'submission'
    ): NamecardSubmissionRow {
        // Exchange rows keep the Fudaba object layout until approval copies the
        // images into the canonical namecard layout, so pending ones are served
        // through the authenticated moderation media route. Once the canonical
        // key is written, the regular reversal applies and the row behaves like
        // any other namecard.
        const media = (key: string | null, side: 'front' | 'back'): string | null =>
            this.namecardMediaUrl(row, key, side, content);
        const staged = content === 'submission' && row.review_status === 'pending';
        const payload = staged ? pendingNamecardPayload(row.pending_payload) : null;
        return {
            id: Number(row.card_number),
            cardId: row.internal_id,
            card_number: Number(row.card_number),
            producer_name: row.producer_name ?? null,
            producer_reading: row.producer_reading ?? null,
            group_name: row.group_name ?? null,
            made_on: row.made_on ?? null,
            bio: row.bio ?? null,
            trade_note: row.trade_note ?? null,
            is_original: row.is_original ?? false,
            made_with_ai: row.made_with_ai ?? false,
            exchange_mode: row.exchange_mode === 'auto' || row.exchange_mode === 'manual'
                ? row.exchange_mode
                : 'none',
            accent: row.accent ?? null,
            owner_account_id: row.owner_account_id ?? null,
            // The front image is NOT NULL in the schema, so this never degrades
            // to null the way the optional back image can.
            image1_url: media(
                (staged ? row.pending_front_object_key : null) ?? row.front_object_key,
                'front'
            ) as string,
            image2_url: media(
                (staged ? row.pending_back_object_key : null) ?? row.back_object_key,
                'back'
            ),
            // A pending revision is a queue item even though the live copy is
            // still published; the wall reads the database directly and is not
            // affected by how the queue labels the card.
            status: staged ? 'pending' : toLegacyNamecardStatus(row.publication_status),
            revision: Number(row.revision),
            series_code: payload?.series_codes?.[0] ?? null,
            submission_kind: row.origin === 'guest' ? 'guest' : 'legacy',
            lockReason: row.lock_reason ?? null,
            reviewStatus: staged ? 'pending' : toNamecardReviewStatus(row.review_status),
            reviewReason: row.review_reason ?? null,
            created_at: row.created_at
        };
    }

    /** Series live in their own table now; the queue only needs the first one. */
    private async listNamecardSeries(
        database: SqlDatabase,
        cardIds: readonly string[]
    ): Promise<Map<string, string[]>> {
        const grouped = new Map<string, string[]>();
        for (const cardId of cardIds) grouped.set(cardId, []);
        if (!cardIds.length) return grouped;
        const placeholders = cardIds.map(() => '?').join(', ');
        const result = await (database.prepare(
            `SELECT card_id, series_code FROM public.fudaba_card_series
             WHERE card_id IN (${placeholders})
             ORDER BY card_id, display_order`
        ).bind(...cardIds).all<{ card_id: string; series_code: string }>());
        for (const row of result.results) {
            grouped.get(row.card_id)?.push(row.series_code);
        }
        return grouped;
    }

    private async attachNamecardFavorites(
        database: SqlDatabase,
        rows: readonly NamecardCardRow[],
        content: 'live' | 'submission' = 'submission'
    ): Promise<Array<NamecardSubmissionRow & { favorite_characters: CardFavoriteSelectionRecord[] }>> {
        const ids = rows.map((row) => row.internal_id);
        const characters = await this.listNamecardFavorites(database, ids);
        const series = await this.listNamecardSeries(database, ids);
        const credits = await this.listNamecardCredits(database, ids);
        const middle = await this.listNamecardMiddleMedia(database, ids);
        return rows.map((row) => {
            const favoriteCharacters = characters.get(row.internal_id) ?? [];
            const record = this.namecardRecordFromRow(row, content);
            const payload =
                content === 'submission' && row.review_status === 'pending'
                    ? pendingNamecardPayload(row.pending_payload)
                    : null;
            const seriesCodes = series.get(row.internal_id) ?? [];
            return {
                ...record,
                origin: row.origin,
                producer_name: payload?.producer_name ?? row.producer_name ?? null,
                favorite_characters: favoriteCharacters,
                seriesCode: seriesCodes[0] ?? record.series_code ?? null,
                series_codes: seriesCodes,
                credits: credits.get(row.internal_id) ?? [],
                middle_image_urls: this.namecardMiddleUrls(
                    row,
                    middle.get(row.internal_id) ?? [],
                    content
                ),
                submissionKind: record.submission_kind ?? 'legacy',
                favoriteCharacters
            };
        });
    }

    /** Ordered middle page object keys of the published copy. */
    private async listNamecardMiddleMedia(
        database: SqlDatabase,
        cardIds: readonly string[]
    ): Promise<Map<string, string[]>> {
        const grouped = new Map<string, string[]>();
        for (const cardId of cardIds) grouped.set(cardId, []);
        if (!cardIds.length) return grouped;
        const placeholders = cardIds.map(() => '?').join(', ');
        const result = await database.prepare(
            `SELECT card_id, object_key FROM public.fudaba_card_media
             WHERE card_id IN (${placeholders})
             ORDER BY card_id, display_order`
        ).bind(...cardIds).all<{ card_id: string; object_key: string }>();
        for (const row of result.results) {
            grouped.get(row.card_id)?.push(row.object_key);
        }
        return grouped;
    }

    /**
     * Middle pages always travel through the card media route: the editor
     * layout has no reversible public path, and the queue must see the pages of
     * the revision under review.
     */
    private namecardMiddleUrls(
        row: NamecardCardRow,
        keys: readonly string[],
        content: 'live' | 'submission'
    ): string[] {
        const staged =
            content === 'submission' &&
            row.review_status === 'pending' &&
            (row.pending_middle_object_keys?.length ?? 0) > 0;
        const effective = staged ? row.pending_middle_object_keys! : keys;
        const variant = staged ? 'draft' : 'live';
        const cardNumber = Number(row.card_number);
        return effective.map((_key, index) =>
            content === 'submission'
                ? adminNamecardMediaPath(cardNumber, variant, `middle-${index + 1}`)
                : namecardMediaPath(cardNumber, `middle-${index + 1}`)
        );
    }

    private async listNamecardCredits(
        database: SqlDatabase,
        cardIds: readonly string[]
    ): Promise<Map<string, FudabaCardCredit[]>> {
        const grouped = new Map<string, FudabaCardCredit[]>();
        for (const cardId of cardIds) grouped.set(cardId, []);
        if (!cardIds.length) return grouped;
        const placeholders = cardIds.map(() => '?').join(', ');
        const result = await database.prepare(
            `SELECT card_id, account_id, display_name, url, roles
             FROM public.fudaba_card_credits
             WHERE card_id IN (${placeholders})
             ORDER BY card_id, display_order`
        ).bind(...cardIds).all<{
            card_id: string;
            account_id: string | null;
            display_name: string;
            url: string | null;
            roles: string[];
        }>();
        for (const row of result.results) {
            grouped.get(row.card_id)?.push({
                accountId: row.account_id,
                displayName: row.display_name,
                url: row.url,
                roles: row.roles as FudabaCardCredit['roles']
            });
        }
        return grouped;
    }

    private async attachOneNamecard(
        database: SqlDatabase,
        row: NamecardCardRow | null
    ): Promise<NamecardSubmissionRecord | null> {
        if (!row) return null;
        return (await this.attachNamecardFavorites(database, [row]))[0] ?? null;
    }

    async insertPendingCard(input: PendingCardInput): Promise<number> {
        const submissionKind = input.submissionKind ?? 'guest';
        const characterIds = input.characterIds ?? [];
        const idPrefix = submissionKind === 'legacy' ? 'legacy' : 'guest';
        const frontKey = publicMediaObjectKey(input.image1Url);
        const backKey =
            input.image2Url === null || input.image2Url === ''
                ? null
                : publicMediaObjectKey(input.image2Url);
        return this.database.transaction(async (database) => {
            const characters = await this.validateNamecardSelection(
                database,
                input.seriesCode ?? null,
                characterIds,
                submissionKind
            );
            const created = await queryOne<{ id: string; card_number: number | string }>(
                database,
                `WITH allocated AS (
                     SELECT nextval('public.namecard_number_seq') AS card_number
                 )
                 INSERT INTO fudaba_cards
                    (id, card_number, origin, producer_name,
                     front_object_key, back_object_key, accent, bio, trade_note,
                     exchange_mode, publication_status, revision,
                     created_at, updated_at)
                 SELECT ? || '-' || allocated.card_number::text, allocated.card_number,
                        ?, ?, ?, ?, COALESCE(?, '#4f64dd'), ?, NULL,
                        'none', 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                 FROM allocated
                 RETURNING id, card_number`,
                [
                    idPrefix,
                    idPrefix,
                    input.producerName ?? null,
                    frontKey,
                    backKey,
                    input.accent ?? null,
                    input.bio ?? null
                ]
            );
            if (!created) throw new Error('Card insert did not return an ID');
            // Guest cards keep their single series in the shared set table.
            if (input.seriesCode) {
                await executeSql(database,
                    `INSERT INTO public.fudaba_card_series
                        (card_id, series_code, display_order)
                     VALUES (?, ?, 1)
                     ON CONFLICT (card_id, series_code) DO NOTHING`,
                    [created.id, input.seriesCode]
                );
            }
            if (characters.length) {
                await database.batch(characters.map((character) => database.prepare(
                    `INSERT INTO fudaba_card_favorite_characters (card_id, character_id, display_order)
                     VALUES (?, ?, ?)`
                ).bind(created.id, character.character_id, character.display_order)));
            }
            await executeSql(database,
                `INSERT INTO namecard_guest_attributes
                    (card_id, hash1, hash2, submitted_ip, withdrawal_token_hash)
                 VALUES (?, ?, ?, ?, ?)`,
                [created.id, input.hash1, input.hash2, input.ip, input.withdrawalTokenHash]
            );
            return Number(created.card_number);
        });
    }

    async countApprovedCards(): Promise<number> {
        // The public wall only serves the two anonymous shapes: the legacy
        // archive rows and guest uploads. Registered-user cards are listed in
        // the admin queue and, once approved, reach the exchange wall through
        // the media publishing pipeline instead of this legacy payload.
        const row = await queryOne<{ total: number }>(this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM fudaba_cards
             WHERE publication_status='published'
               AND ${NAMECARD_PUBLIC_ORIGIN}
               AND deleted_at IS NULL`
        );
        return row?.total ?? 0;
    }

    async attachCanonicalMedia(cardId: string, frontKey: string, backKey: string): Promise<void> {
        // Approval copies an upload's images into the canonical namecard layout
        // so every public reader can reverse the stored key. The origin guard
        // keeps the writable target to the registered-user row being approved.
        await executeSql(this.database,
            `UPDATE fudaba_cards
             SET front_object_key=CASE WHEN review_status='pending'
                     THEN front_object_key ELSE ? END,
                 back_object_key=CASE WHEN review_status='pending'
                     THEN back_object_key ELSE ? END,
                 pending_front_object_key=CASE WHEN review_status='pending'
                     THEN ? ELSE pending_front_object_key END,
                 pending_back_object_key=CASE WHEN review_status='pending'
                     THEN ? ELSE pending_back_object_key END,
                 updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND origin='exchange' AND deleted_at IS NULL`,
            [frontKey, backKey, frontKey, backKey, cardId]
        );
    }

    async countAdminCards(filter?: NamecardAdminFilter): Promise<number> {
        const where = namecardAdminWhere(filter);
        const row = await queryOne<{ total: number }>(this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM fudaba_cards WHERE ${where.sql}`,
            where.values
        );
        return row?.total ?? 0;
    }

    async listApprovedCards(limit: number, offset: number): Promise<NamecardPublicRecord[]> {
        const rows = await queryAll<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE publication_status='published'
               AND ${NAMECARD_PUBLIC_ORIGIN}
               AND deleted_at IS NULL
             ORDER BY card_number DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        // The wall publishes the live copy; a pending revision stays queued.
        return await this.attachNamecardFavorites(
            this.database,
            rows,
            'live'
        ) as NamecardPublicRecord[];
    }

    async findApprovedCardMedia(id: number): Promise<CardMediaRecord | null> {
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=?
               AND publication_status='published' AND deleted_at IS NULL`,
            [id]
        );
        return this.attachOneNamecard(this.database, row);
    }

    async listAdminCards(limit: number, offset: number, filter?: NamecardAdminFilter): Promise<NamecardSubmissionRecord[]> {
        const where = namecardAdminWhere(filter);
        const rows = await queryAll<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE ${where.sql}
             ORDER BY CASE
                          WHEN publication_status IN ('pending', 'approving') OR review_status = 'pending' THEN 0
                          WHEN publication_status = 'published' THEN 1
                          WHEN publication_status = 'rejected' THEN 2
                          WHEN publication_status = 'locked' THEN 3
                          WHEN publication_status = 'hidden' THEN 4
                          ELSE 5
                      END,
                      CASE WHEN publication_status IN ('pending', 'approving') OR review_status = 'pending'
                           THEN COALESCE(review_submitted_at, created_at) END ASC NULLS LAST,
                      card_number DESC
             LIMIT ? OFFSET ?`,
            [...where.values, limit, offset]
        );
        return this.attachNamecardFavorites(this.database, rows);
    }

    /**
     * Both sides of the review queue: the published copy the wall serves and
     * the revision waiting for a verdict. The public read path never needs
     * this, so it stays a separate query instead of widening every list row.
     */
    async findCardDiff(cardNumber: number): Promise<NamecardDiffRecord | null> {
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND deleted_at IS NULL`,
            [cardNumber]
        );
        if (!row) return null;
        const cardId = row.internal_id;
        const [favorites, series, credits, middleKeys] = await Promise.all([
            this.listNamecardFavorites(this.database, [cardId]),
            this.listNamecardSeries(this.database, [cardId]),
            this.listNamecardCredits(this.database, [cardId]),
            this.listMiddleKeys(cardId)
        ]);
        const live: NamecardDiffSide = {
            producerName: row.producer_name ?? null,
            producerReading: row.producer_reading ?? null,
            groupName: row.group_name ?? null,
            madeOn: row.made_on ?? null,
            bio: row.bio ?? null,
            tradeNote: row.trade_note ?? null,
            isOriginal: row.is_original === true,
            madeWithAi: row.made_with_ai === true,
            visible: row.visible === true,
            exchangeMode: this.exchangeMode(row.exchange_mode),
            seriesCodes: series.get(cardId) ?? [],
            credits: credits.get(cardId) ?? [],
            favoriteCharacters: favorites.get(cardId) ?? [],
            frontImageUrl: this.adminMediaUrl(cardNumber, 'front'),
            backImageUrl: row.back_object_key
                ? this.adminMediaUrl(cardNumber, 'back')
                : null,
            middleImageUrls: middleKeys.map((_key, index) =>
                this.adminMediaUrl(cardNumber, `middle-${index + 1}`)
            )
        };
        const payload = row.review_status === 'pending'
            ? pendingNamecardPayload(row.pending_payload)
            : null;
        const ownerAccountId = row.owner_account_id ?? null;
        return {
            id: Number(row.card_number),
            status: toLegacyNamecardStatus(row.publication_status),
            publicationStatus: row.publication_status as NamecardDiffRecord['publicationStatus'],
            reviewStatus: toNamecardReviewStatus(row.review_status),
            revision: Number(row.revision),
            ownerAccountId,
            ownerDisplayName: ownerAccountId
                ? await this.accountLabel(this.database, ownerAccountId)
                : null,
            lockReason: row.lock_reason ?? null,
            reviewReason: row.review_reason ?? null,
            live,
            pending: payload
                ? await this.pendingDiffSide(row, payload, live, middleKeys)
                : null
        };
    }

    /**
     * Moderators read artwork through the admin media route: the stored keys of
     * a submitted revision have no public URL to reverse.
     */
    private adminMediaUrl(cardNumber: number, side: string, draft = false): string {
        return adminNamecardMediaPath(cardNumber, draft ? 'draft' : 'live', side);
    }

    /** Live middle-page keys in display order. */
    private async listMiddleKeys(cardId: string): Promise<string[]> {
        const stored = await queryAll<{ object_key: string }>(this.database,
            `SELECT object_key FROM public.fudaba_card_media
             WHERE card_id=? ORDER BY display_order`,
            [cardId]
        );
        return stored.map((row) => row.object_key);
    }

    /** The object key behind one page of a card's artwork. */
    findCardMediaKey(
        cardNumber: number,
        side: string,
        draft: boolean
    ): Promise<string | null> {
        return this.cardMediaKey(cardNumber, side, draft, false);
    }

    /** The same key, but only for a card the wall may show publicly. */
    findPublishedCardMediaKey(
        cardNumber: number,
        side: string
    ): Promise<string | null> {
        return this.cardMediaKey(cardNumber, side, false, true);
    }

    private async cardMediaKey(
        cardNumber: number,
        side: string,
        draft: boolean,
        publishedOnly: boolean
    ): Promise<string | null> {
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND deleted_at IS NULL${
                publishedOnly ? " AND publication_status='published'" : ''
             }`,
            [cardNumber]
        );
        if (!row) return null;
        const middle = /^middle-(\d{1,2})$/.exec(side);
        if (side === 'front') {
            return ((draft ? row.pending_front_object_key : null) ?? row.front_object_key) ?? null;
        }
        if (side === 'back') {
            return ((draft ? row.pending_back_object_key : null) ?? row.back_object_key) ?? null;
        }
        if (!middle) return null;
        if (draft && row.pending_middle_object_keys?.length) {
            return row.pending_middle_object_keys[Number(middle[1]) - 1] ?? null;
        }
        const keys = await this.listMiddleKeys(row.internal_id);
        return keys[Number(middle[1]) - 1] ?? null;
    }

    private exchangeMode(value: unknown): 'auto' | 'manual' | 'none' {
        return value === 'auto' || value === 'manual' ? value : 'none';
    }

    private async pendingDiffSide(
        row: NamecardCardRow,
        payload: NamecardPendingPayload,
        live: NamecardDiffSide,
        liveMiddleKeys: string[]
    ): Promise<NamecardDiffSide> {
        const ids = payload.favorite_character_ids ?? [];
        const cardNumber = Number(row.card_number);
        const frontKey = row.pending_front_object_key ?? row.front_object_key;
        const backKey = row.pending_back_object_key ?? row.back_object_key;
        const middleKeys =
            row.pending_middle_object_keys?.length
                ? row.pending_middle_object_keys
                : liveMiddleKeys;
        // A page that kept its object keeps the live URL, so the diff compares
        // equal strings and does not report an untouched image as changed.
        const pageUrl = (
            key: string | null,
            liveKey: string | null,
            liveUrl: string,
            side: string
        ) =>
            key === null
                ? null
                : key === liveKey
                  ? liveUrl
                  : this.adminMediaUrl(cardNumber, side, true);
        return {
            producerName: payload.producer_name ?? row.producer_name ?? null,
            producerReading: this.payloadText(payload, 'producer_reading', row.producer_reading),
            groupName: this.payloadText(payload, 'group_name', row.group_name),
            madeOn: this.payloadText(payload, 'made_on', row.made_on),
            bio: this.payloadText(payload, 'bio', row.bio),
            tradeNote: this.payloadText(payload, 'trade_note', row.trade_note),
            isOriginal: payload.is_original ?? row.is_original === true,
            madeWithAi: payload.made_with_ai ?? row.made_with_ai === true,
            visible: payload.visible ?? row.visible === true,
            exchangeMode: this.exchangeMode(payload.exchange_mode ?? row.exchange_mode),
            seriesCodes: payload.series_codes ?? [],
            credits: payload.credits ?? [],
            favoriteCharacters: await this.listCharacterSelections(this.database, ids),
            frontImageUrl:
                pageUrl(frontKey, row.front_object_key, live.frontImageUrl, 'front') ??
                live.frontImageUrl,
            backImageUrl: pageUrl(backKey, row.back_object_key, live.backImageUrl ?? '', 'back'),
            middleImageUrls: middleKeys.map((key, index) =>
                pageUrl(
                    key,
                    liveMiddleKeys[index] ?? null,
                    live.middleImageUrls[index] ?? '',
                    `middle-${index + 1}`
                ) ?? live.middleImageUrls[index] ?? ''
            )
        };
    }

    /** A submitted revision is authoritative, including when it clears a field. */
    private payloadText(
        payload: NamecardPendingPayload,
        key: 'producer_reading' | 'group_name' | 'made_on' | 'bio' | 'trade_note',
        fallback: string | null | undefined
    ): string | null {
        if (key in payload) return payload[key] ?? null;
        return fallback ?? null;
    }

    /** Character names for a submitted selection, kept in submission order. */
    private async listCharacterSelections(
        database: SqlDatabase,
        ids: readonly number[]
    ): Promise<CardFavoriteSelectionRecord[]> {
        if (!ids.length) return [];
        const placeholders = ids.map(() => '?').join(', ');
        const rows = await queryAll<NamecardFavoriteRow>(database,
            `SELECT character.id AS character_id, agency.code AS agency_code,
                    character.name_cn
             FROM namecard_characters character
             JOIN agencies agency ON agency.id=character.agency_id
             WHERE character.id IN (${placeholders})`,
            [...ids]
        );
        const byId = new Map(rows.map((row) => [Number(row.character_id), row]));
        return ids.flatMap((id, index) => {
            const row = byId.get(id);
            return row
                ? [{
                    character_id: id,
                    agency_code: row.agency_code,
                    name_cn: row.name_cn,
                    display_order: index
                }]
                : [];
        });
    }

    async beginCardApproval(
        id: number,
        expectedRevision: number
    ): Promise<NamecardApprovalClaim> {
        const claimedRow = await queryOne<NamecardCardRow>(this.database,
            `UPDATE fudaba_cards
             SET publication_status=CASE WHEN publication_status='pending'
                     THEN 'approving' ELSE publication_status END,
                 revision=revision+1, updated_at=CURRENT_TIMESTAMP
             WHERE card_number=? AND revision=? AND deleted_at IS NULL
               AND (publication_status='pending' OR review_status='pending')
             RETURNING ${NAMECARD_COLUMNS}`,
            [id, expectedRevision]
        );
        const claimed = await this.attachOneNamecard(this.database, claimedRow);
        if (claimed) return { status: 'claimed', card: claimed };
        const current = await this.findSubmission(id);
        if (!current) return { status: 'not-found' };
        if (current.status === 'withdrawn') {
            return { status: 'withdrawn', revision: current.revision };
        }
        if (
            (current.status === 'approving' || current.status === 'pending') &&
            (current.revision === expectedRevision || current.revision === expectedRevision + 1)
        ) {
            return { status: 'resumed', card: current };
        }
        return { status: 'conflict', revision: current.revision };
    }

    async completeCardApproval(
        id: number,
        approvingRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const claimedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `SELECT ${NAMECARD_COLUMNS}, owner_account_id FROM fudaba_cards
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                   AND (publication_status='approving'
                        OR (review_status='pending' AND publication_status='published'))
                 FOR UPDATE`,
                [id, approvingRevision]
            );
            let updatedRow: (NamecardCardRow & { owner_account_id?: string | null }) | null = null;
            if (claimedRow) {
                if (claimedRow.review_status === 'pending') {
                    await this.publishNamecardRevision(
                        database,
                        claimedRow,
                        pendingNamecardPayload(claimedRow.pending_payload)
                    );
                } else {
                    await executeSql(database,
                        `UPDATE fudaba_cards
                         SET publication_status='published', rejection_reason=NULL,
                             revision=revision+1, updated_at=CURRENT_TIMESTAMP
                         WHERE id=?`,
                        [claimedRow.internal_id]
                    );
                }
                updatedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                    `SELECT ${NAMECARD_COLUMNS}, owner_account_id FROM fudaba_cards WHERE id=?`,
                    [claimedRow.internal_id]
                );
            }
            const updated = await this.attachOneNamecard(database, updatedRow);
            if (updated) {
                if (updatedRow?.owner_account_id) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: String(updatedRow.owner_account_id),
                        cardNumber: id,
                        ...cardApprovedCopy(id)
                    });
                }
                return { status: 'updated', card: updated };
            }
            const current = await this.findSubmission(id, database);
            if (!current) return { status: 'not-found' };
            if (current.status === 'approved' && current.revision === approvingRevision + 1) {
                return { status: 'updated', card: current };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    /**
     * Promotes the submitted revision into the live columns. Favourites are
     * rewritten from the submitted ids; a character deleted in the meantime
     * drops out instead of blocking the publication.
     */
    private async publishNamecardRevision(
        database: SqlDatabase,
        row: NamecardCardRow,
        payload: NamecardPendingPayload | null
    ): Promise<void> {
        // Text columns that the author may clear need a flag instead of
        // COALESCE: a submitted revision is authoritative even when it is empty.
        const hasPayload = payload !== null
        await executeSql(database,
            `UPDATE fudaba_cards
             SET producer_name=?,
                 producer_reading=CASE WHEN ? THEN ? ELSE producer_reading END,
                 bio=CASE WHEN ? THEN ? ELSE bio END,
                 trade_note=CASE WHEN ? THEN ? ELSE trade_note END,
                 made_on=COALESCE(?, made_on), group_name=COALESCE(?, group_name),
                 is_original=COALESCE(?, is_original),
                 made_with_ai=COALESCE(?, made_with_ai),
                 visible=COALESCE(?, visible),
                 exchange_mode=COALESCE(?, exchange_mode),
                 front_object_key=COALESCE(pending_front_object_key, front_object_key),
                 back_object_key=COALESCE(pending_back_object_key, back_object_key),
                 publication_status='published', rejection_reason=NULL,
                 review_status=NULL, review_reason=NULL, review_submitted_at=NULL,
                 pending_payload=NULL, pending_front_object_key=NULL,
                 pending_back_object_key=NULL,
                 revision=revision+1, updated_at=CURRENT_TIMESTAMP
             WHERE id=?`,
            [
                payload?.producer_name ?? row.producer_name ?? null,
                hasPayload,
                payload?.producer_reading ?? null,
                hasPayload,
                payload?.bio ?? null,
                hasPayload,
                payload?.trade_note ?? null,
                payload?.made_on ?? null,
                payload?.group_name ?? null,
                payload?.is_original ?? null,
                payload?.made_with_ai ?? null,
                payload?.visible ?? null,
                payload?.exchange_mode ?? null,
                row.internal_id
            ]
        );
        if (payload) {
            await this.replaceNamecardCredits(
                database,
                row.internal_id,
                payload.credits ?? []
            )
        }
        const seriesCodes = (payload?.series_codes ?? []).filter(
            (code) => typeof code === 'string' && code.length > 0
        );
        if (seriesCodes.length) {
            await executeSql(database,
                'DELETE FROM fudaba_card_series WHERE card_id=?',
                [row.internal_id]
            );
            for (const [index, seriesCode] of seriesCodes.entries()) {
                await executeSql(database,
                    `INSERT INTO fudaba_card_series (card_id, series_code, display_order)
                     VALUES (?, ?, ?)
                     ON CONFLICT (card_id, series_code) DO NOTHING`,
                    [row.internal_id, seriesCode, index + 1]
                );
            }
            // A sampled colour always wins; otherwise one series lends its
            // agency colour and a set stays neutral.
            const singleSeries = seriesCodes.length === 1;
            await executeSql(database,
                `UPDATE fudaba_cards SET
                     accent=CASE WHEN ? THEN COALESCE(
                         (SELECT color FROM agencies WHERE code=?),
                         CAST(? AS text), accent)
                     ELSE CAST(? AS text) END,
                     accent_source=CASE WHEN ? THEN 'series' ELSE 'fallback' END
                 WHERE id=? AND (accent_source IS NULL OR accent_source<>'image')`,
                [
                    singleSeries,
                    seriesCodes[0],
                    NAMECARD_ACCENT_FALLBACK,
                    NAMECARD_ACCENT_FALLBACK,
                    singleSeries,
                    row.internal_id,
                ]
            );
        }
        const characterIds = (payload?.favorite_character_ids ?? []).filter(
            (characterId) => Number.isSafeInteger(characterId) && characterId > 0
        );
        if (!characterIds.length) return;
        await executeSql(database,
            'DELETE FROM fudaba_card_favorite_characters WHERE card_id=?',
            [row.internal_id]
        );
        await executeSql(database,
            `INSERT INTO fudaba_card_favorite_characters (card_id, character_id, display_order)
             SELECT ?, character.id, ? FROM namecard_characters character
             WHERE character.id=? AND character.deleted_at IS NULL`,
            [row.internal_id, 0, characterIds[0]]
        ).catch(() => undefined);
        for (let index = 1; index < characterIds.length; index += 1) {
            await executeSql(database,
                `INSERT INTO fudaba_card_favorite_characters (card_id, character_id, display_order)
                 SELECT ?, character.id, ? FROM namecard_characters character
                 WHERE character.id=? AND character.deleted_at IS NULL`,
                [row.internal_id, index, characterIds[index]]
            ).catch(() => undefined);
        }
    }

    private async replaceNamecardCredits(
        database: SqlDatabase,
        cardId: string,
        credits: readonly FudabaCardCredit[]
    ): Promise<void> {
        await executeSql(database,
            'DELETE FROM fudaba_card_credits WHERE card_id=?',
            [cardId]
        );
        for (const [index, credit] of credits.entries()) {
            if (!credit.displayName.trim()) continue;
            await executeSql(database,
                `INSERT INTO fudaba_card_credits
                 (card_id, display_order, account_id, display_name, url, roles)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    cardId,
                    index + 1,
                    credit.accountId ?? null,
                    credit.displayName,
                    credit.url ?? null,
                    credit.roles
                ]
            );
        }
    }

    async findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.findSubmission(id);
    }


    /**
     * Backoffice management rewrites the live card in one shot: the fields the
     * owner editor owns, the artwork order over existing pages, both review
     * columns and the owner. Everything else (accent, first publication, review
     * queue payload) is left to the flows that already own it.
     */
    async updateCardAsAdmin(
        input: NamecardAdminUpdateInput
    ): Promise<NamecardAdminUpdateResult> {
        return this.database.transaction(async (database) => {
            const current = await queryOne<NamecardCardRow>(database,
                `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [input.cardNumber]
            );
            if (!current) return { status: 'not-found' };
            const cardId = current.internal_id;
            const revision = Number(current.revision);
            if (revision !== input.expectedRevision) {
                return { status: 'conflict', revision };
            }
            const [seriesMap, creditsMap, favoritesMap, middleKeys] = await Promise.all([
                this.listNamecardSeries(database, [cardId]),
                this.listNamecardCredits(database, [cardId]),
                this.listNamecardFavorites(database, [cardId]),
                this.listMiddleKeys(cardId)
            ]);
            const liveSlots = [
                current.front_object_key,
                ...middleKeys,
                ...(current.back_object_key ? [current.back_object_key] : [])
            ];
            const slotIndexes = input.mediaOrder.map((token) => Number(token.slice(1)));
            const slotsAreValid =
                slotIndexes.length > 0 &&
                new Set(slotIndexes).size === slotIndexes.length &&
                slotIndexes.every(
                    (index) =>
                        Number.isSafeInteger(index) && index >= 0 && index < liveSlots.length
                );
            if (!slotsAreValid) {
                return {
                    status: 'invalid-media',
                    message: '只能删除或调整现有图片的顺序'
                };
            }
            const orderedKeys = slotIndexes.map((index) => liveSlots[index]!);
            const frontKey = orderedKeys[0]!;
            const backKey =
                orderedKeys.length > 1 ? orderedKeys[orderedKeys.length - 1]! : null;
            const nextMiddleKeys = orderedKeys.length > 2 ? orderedKeys.slice(1, -1) : [];

            const previousOwner = current.owner_account_id ?? null;
            const nextOwner =
                input.ownerAccountId === undefined ? previousOwner : input.ownerAccountId;
            let nextOwnerName: string | null = null;
            if (nextOwner !== null) {
                const account = await queryOne<{ display_name: string | null; status: string }>(
                    database,
                    `SELECT profile.display_name, account.status
                       FROM platform_accounts account
                       LEFT JOIN platform_profiles profile ON profile.account_id = account.id
                      WHERE account.id=? AND account.deleted_at IS NULL`,
                    [nextOwner]
                );
                if (!account) {
                    return { status: 'invalid-owner', message: '账号不存在' };
                }
                if (account.status !== 'active') {
                    return {
                        status: 'invalid-owner',
                        message: '该账号已被禁用，不能作为名片归属'
                    };
                }
                nextOwnerName = account.display_name ?? nextOwner;
            }
            const ownerChanged = nextOwner !== previousOwner;

            // An unowned card keeps the trade terms empty; the owner layer check
            // in the table enforces it, so the payload is normalised here.
            const tradeNote = nextOwner === null ? null : input.content.tradeNote;
            const exchangeMode = nextOwner === null ? 'none' : input.content.exchangeMode;

            const liveCharacterIds = (favoritesMap.get(cardId) ?? []).map((entry) =>
                Number(entry.character_id)
            );
            const [agencyNames, previousOwnerName] = await Promise.all([
                this.agencyLabels(database),
                previousOwner === null ? null : this.accountLabel(database, previousOwner)
            ]);
            const characterNames = await this.characterLabels(database, [
                ...liveCharacterIds,
                ...input.content.favoriteCharacterIds
            ]);

            const seriesLabel = (codes: readonly string[]): string | null =>
                codes.length
                    ? codes.map((code) => agencyNames.get(code) ?? code).join('、')
                    : null;
            const characterLabel = (ids: readonly number[]): string | null =>
                ids.length
                    ? ids.map((id) => characterNames.get(id) ?? String(id)).join('、')
                    : null;
            const creditsLabel = (credits: readonly FudabaCardCredit[]): string | null =>
                credits.length
                    ? credits
                          .map(
                              (credit) =>
                                  `${credit.displayName}${credit.url ? ` (${credit.url})` : ''} [${credit.roles.join('、')}]`
                          )
                          .join('；')
                    : null;
            const flag = (value: boolean): string => (value ? '是' : '否');

            const changes: NamecardAdminFieldChange[] = [];
            const record = (name: string, before: string | null, after: string | null) => {
                if ((before ?? '') !== (after ?? '')) {
                    changes.push({ label: name, before, after });
                }
            };
            record('制作人名称', current.producer_name ?? null, input.content.producerName);
            record('制作人读音', current.producer_reading ?? null, input.content.producerReading);
            record('团体名称', current.group_name ?? null, input.content.groupName);
            record('制作日期', current.made_on ?? null, input.content.madeOn);
            record('企划', seriesLabel(seriesMap.get(cardId) ?? []), seriesLabel(input.content.seriesCodes));
            record(
                '担当角色',
                characterLabel(liveCharacterIds),
                characterLabel(input.content.favoriteCharacterIds)
            );
            record('简介', current.bio ?? null, input.content.bio);
            record(
                '创作人员',
                creditsLabel(creditsMap.get(cardId) ?? []),
                creditsLabel(input.content.credits)
            );
            record('原创标记', flag(current.is_original === true), flag(input.content.isOriginal));
            record('AI 标记', flag(current.made_with_ai === true), flag(input.content.madeWithAi));
            record('交换说明', current.trade_note ?? null, tradeNote);
            record(
                '交换模式',
                NAMECARD_ADMIN_EXCHANGE_LABELS[current.exchange_mode ?? 'none'] ?? null,
                NAMECARD_ADMIN_EXCHANGE_LABELS[exchangeMode] ?? null
            );
            record('公开显示', flag(current.visible === true), flag(input.content.visible));
            if (orderedKeys.length !== liveSlots.length) {
                record('图片', `${liveSlots.length} 张`, `${orderedKeys.length} 张`);
            } else if (slotIndexes.some((index, position) => index !== position)) {
                record(
                    '图片顺序',
                    liveSlots.map((_key, index) => index + 1).join(','),
                    slotIndexes.map((index) => index + 1).join(',')
                );
            }
            record(
                '名片状态',
                NAMECARD_ADMIN_STATUS_LABELS[current.publication_status] ?? current.publication_status,
                NAMECARD_ADMIN_STATUS_LABELS[input.status] ?? input.status
            );
            const currentReviewStatus = toNamecardReviewStatus(current.review_status);
            record(
                '版本状态',
                NAMECARD_ADMIN_REVIEW_LABELS[currentReviewStatus ?? 'none'],
                NAMECARD_ADMIN_REVIEW_LABELS[input.reviewStatus ?? 'none']
            );
            if (ownerChanged) {
                record(
                    '账号归属',
                    previousOwnerName,
                    nextOwner === null ? null : nextOwnerName
                );
            }

            const reason = input.reason?.trim() ?? '';
            if (changes.length > 0 && !reason.length) {
                return { status: 'reason-required' };
            }
            if (changes.length === 0) {
                return { status: 'updated', revision, changedFields: [], ownerChange: null };
            }

            // `review_status` may only be set while a payload describes the
            // submitted revision, so a verdict on a card without one takes the
            // submitted content as that revision.
            const reviewStatus = input.reviewStatus;
            const pendingPayload =
                reviewStatus === null
                    ? null
                    : pendingNamecardPayload(current.pending_payload) ??
                      {
                          producer_name: input.content.producerName,
                          producer_reading: input.content.producerReading,
                          bio: input.content.bio,
                          trade_note: tradeNote,
                          credits: [...input.content.credits],
                          series_codes: [...input.content.seriesCodes],
                          group_name: input.content.groupName,
                          made_on: input.content.madeOn,
                          is_original: input.content.isOriginal,
                          made_with_ai: input.content.madeWithAi,
                          visible: input.content.visible,
                          exchange_mode: exchangeMode,
                          favorite_character_ids: [...input.content.favoriteCharacterIds]
                      };

            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards SET
                     producer_name=?, producer_reading=?, group_name=?, made_on=?,
                     bio=?, trade_note=?, is_original=?, made_with_ai=?,
                     visible=?, exchange_mode=?,
                     front_object_key=?, back_object_key=?,
                     publication_status=?, lock_reason=?,
                     review_status=?, review_reason=?, review_submitted_at=?,
                     pending_payload=CAST(? AS jsonb),
                     pending_front_object_key=?, pending_back_object_key=?,
                     pending_middle_object_keys=?,
                     owner_account_id=?,
                     revision=revision+1, updated_at=?
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}`,
                [
                    input.content.producerName,
                    input.content.producerReading,
                    input.content.groupName,
                    input.content.madeOn,
                    input.content.bio,
                    tradeNote,
                    input.content.isOriginal,
                    input.content.madeWithAi,
                    input.content.visible,
                    exchangeMode,
                    frontKey,
                    backKey,
                    input.status,
                    input.status === 'locked' ? reason : null,
                    reviewStatus,
                    reviewStatus === null || reviewStatus === 'pending' ? null : reason,
                    reviewStatus === null ? null : current.review_submitted_at ?? input.updatedAt,
                    pendingPayload === null ? null : JSON.stringify(pendingPayload),
                    reviewStatus === null ? null : current.pending_front_object_key ?? frontKey,
                    reviewStatus === null ? null : current.pending_back_object_key ?? backKey,
                    reviewStatus === null
                        ? []
                        : current.pending_middle_object_keys?.length
                          ? current.pending_middle_object_keys
                          : [...nextMiddleKeys],
                    nextOwner,
                    input.updatedAt,
                    input.cardNumber,
                    input.expectedRevision
                ]
            );
            if (!updatedRow) return { status: 'conflict', revision };
            await this.writeNamecardAdminRelations(
                database,
                cardId,
                input.content,
                nextMiddleKeys
            );

            const cardNumber = Number(current.card_number);
            if (ownerChanged && previousOwner) {
                await insertNamecardNotification(database, {
                    recipientAccountId: previousOwner,
                    cardNumber,
                    ...cardTransferredOutCopy(cardNumber, reason)
                });
            }
            if (nextOwner) {
                if (ownerChanged) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: nextOwner,
                        cardNumber,
                        ...cardTransferredInCopy(cardNumber, reason)
                    });
                }
                await insertNamecardNotification(database, {
                    recipientAccountId: nextOwner,
                    cardNumber,
                    ...cardAdminEditedCopy(cardNumber, reason, changes)
                });
            }
            return {
                status: 'updated',
                revision: Number(updatedRow.revision),
                changedFields: changes,
                ownerChange: ownerChanged
                    ? { previousAccountId: previousOwner, nextAccountId: nextOwner }
                    : null
            };
        });
    }

    /**
     * Sets `deleted_at`: every read path filters it, so the card leaves the
     * owner's list, the wall and the queue at once. Restoring the row takes a
     * database operator, which is the point.
     */
    async deleteCardAsAdmin(
        cardNumber: number,
        expectedRevision: number
    ): Promise<NamecardAdminDeleteResult> {
        return this.database.transaction(async (database) => {
            const current = await queryOne<NamecardCardRow>(database,
                `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [cardNumber]
            );
            if (!current) return { status: 'not-found' };
            const revision = Number(current.revision);
            if (revision !== expectedRevision) {
                return { status: 'conflict', revision };
            }
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards SET
                     deleted_at=CURRENT_TIMESTAMP,
                     review_status=NULL, review_reason=NULL, review_submitted_at=NULL,
                     pending_payload=NULL, pending_front_object_key=NULL,
                     pending_back_object_key=NULL,
                     pending_middle_object_keys=ARRAY[]::text[],
                     lock_reason=NULL,
                     revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}`,
                [cardNumber, expectedRevision]
            );
            if (!updatedRow) return { status: 'conflict', revision };
            return { status: 'updated', revision: Number(updatedRow.revision) };
        });
    }

    /** Agency code → display name, for the change list the owner reads. */
    private async agencyLabels(database: SqlDatabase): Promise<Map<string, string>> {
        const rows = await queryAll<{ code: string; name_cn: string }>(database,
            'SELECT code, name_cn FROM agencies'
        );
        return new Map(rows.map((row) => [row.code, row.name_cn]));
    }

    private async characterLabels(
        database: SqlDatabase,
        ids: readonly number[]
    ): Promise<Map<number, string>> {
        const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
        if (!unique.length) return new Map();
        const placeholders = unique.map(() => '?').join(',');
        const rows = await queryAll<{ id: number | string; name_cn: string }>(database,
            `SELECT id, name_cn FROM namecard_characters WHERE id IN (${placeholders})`,
            unique
        );
        return new Map(rows.map((row) => [Number(row.id), row.name_cn]));
    }

    private async accountLabel(
        database: SqlDatabase,
        accountId: string
    ): Promise<string | null> {
        const row = await queryOne<{ display_name: string | null }>(database,
            'SELECT display_name FROM platform_profiles WHERE account_id=?',
            [accountId]
        );
        return row?.display_name ?? accountId;
    }

    /** Series, credits, favourites and the middle-page rows of one card. */
    private async writeNamecardAdminRelations(
        database: SqlDatabase,
        cardId: string,
        content: NamecardAdminContent,
        middleKeys: readonly string[]
    ): Promise<void> {
        await executeSql(database, 'DELETE FROM fudaba_card_series WHERE card_id=?', [cardId]);
        for (const [index, seriesCode] of content.seriesCodes.entries()) {
            await executeSql(database,
                `INSERT INTO fudaba_card_series (card_id, series_code, display_order)
                 VALUES (?, ?, ?)
                 ON CONFLICT (card_id, series_code) DO NOTHING`,
                [cardId, seriesCode, index + 1]
            );
        }
        await this.replaceNamecardCredits(database, cardId, content.credits);
        await executeSql(database,
            'DELETE FROM fudaba_card_favorite_characters WHERE card_id=?',
            [cardId]
        );
        for (const [index, characterId] of content.favoriteCharacterIds.entries()) {
            await executeSql(database,
                `INSERT INTO fudaba_card_favorite_characters (card_id, character_id, display_order)
                 SELECT ?, character.id, ? FROM namecard_characters character
                 WHERE character.id=? AND character.deleted_at IS NULL`,
                [cardId, index, characterId]
            );
        }
        const stored = await queryAll<{ object_key: string }>(database,
            'SELECT object_key FROM public.fudaba_card_media WHERE card_id=? ORDER BY display_order',
            [cardId]
        );
        const unchanged =
            stored.length === middleKeys.length &&
            stored.every((row, index) => row.object_key === middleKeys[index]);
        if (unchanged) return;
        await executeSql(database,
            'DELETE FROM public.fudaba_card_media WHERE card_id=?',
            [cardId]
        );
        for (const [index, objectKey] of middleKeys.entries()) {
            await executeSql(database,
                `INSERT INTO public.fudaba_card_media (card_id, display_order, object_key)
                 VALUES (?, ?, ?)`,
                [cardId, index + 1, objectKey]
            );
        }
    }

    async lockCard(
        id: number,
        expectedRevision: number,
        reason: string
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const currentRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `SELECT ${NAMECARD_COLUMNS}, owner_account_id FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [id]
            );
            const current = await this.attachOneNamecard(database, currentRow);
            if (!current) return { status: 'not-found' };
            if (current.revision !== expectedRevision) {
                return { status: 'conflict', revision: current.revision };
            }
            // Locking is a review decision, so it never applies to a card that
            // is already locked or that its owner withdrew from the queue.
            if (current.status === 'withdrawn') {
                return { status: 'withdrawn', revision: current.revision };
            }
            if (current.status === 'locked') {
                return { status: 'conflict', revision: current.revision };
            }
            const updatedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `UPDATE fudaba_cards
                 SET publication_status='locked', lock_reason=?,
                     review_status=NULL, review_reason=NULL,
                     review_submitted_at=NULL, pending_payload=NULL,
                     pending_front_object_key=NULL, pending_back_object_key=NULL,
                     revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}, owner_account_id`,
                [reason, id, expectedRevision]
            );
            if (!updatedRow) return { status: 'conflict', revision: current.revision };
            // A card its owner already deleted is not news to them: locking a
            // `hidden` card stays silent.
            if (updatedRow.owner_account_id && current.status !== 'hidden') {
                await insertNamecardNotification(database, {
                    recipientAccountId: String(updatedRow.owner_account_id),
                    cardNumber: id,
                    ...cardLockedCopy(id, reason)
                });
            }
            const updated = await this.attachOneNamecard(database, updatedRow);
            return { status: 'updated', card: updated! };
        });
    }

    async unlockCard(
        id: number,
        expectedRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `UPDATE fudaba_cards
                 SET publication_status='pending', lock_reason=NULL,
                     revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=?
                   AND publication_status='locked' AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}, owner_account_id`,
                [id, expectedRevision]
            );
            if (updatedRow) {
                if (updatedRow.owner_account_id) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: String(updatedRow.owner_account_id),
                        cardNumber: id,
                        ...cardUnlockedCopy(id)
                    });
                }
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmission(id, database);
            if (!current) return { status: 'not-found' };
            if (current.status === 'withdrawn') {
                return { status: 'withdrawn', revision: current.revision };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    async rejectSubmission(
        id: number,
        expectedRevision: number,
        reason: string | null = null
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `UPDATE fudaba_cards SET
                     publication_status=CASE WHEN review_status='pending'
                         THEN publication_status ELSE 'rejected' END,
                     review_status=CASE WHEN review_status='pending'
                         THEN 'rejected' ELSE review_status END,
                     review_reason=CASE WHEN review_status='pending'
                         THEN ? ELSE review_reason END,
                     rejection_reason=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                   AND (publication_status='pending'
                        OR (review_status='pending' AND publication_status='published'))
                 RETURNING ${NAMECARD_COLUMNS}, owner_account_id`,
                [reason, reason, id, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    'UPDATE namecard_guest_attributes SET rejected_at=CURRENT_TIMESTAMP WHERE card_id=?',
                    [updatedRow.internal_id]
                );
                if (updatedRow.owner_account_id) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: String(updatedRow.owner_account_id),
                        cardNumber: id,
                        ...(updatedRow.publication_status === 'published'
                            ? cardRevisionRejectedCopy(id, reason)
                            : cardRejectedCopy(id, reason))
                    });
                }
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmission(id, database);
            if (!current) return { status: 'not-found' };
            if (current.status === 'withdrawn') {
                return { status: 'withdrawn', revision: current.revision };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    /**
     * Marks a submission as breaking the rules: a revision of a published card
     * only loses its own verdict, a first submission is locked outright.
     */
    async flagSubmission(
        id: number,
        expectedRevision: number,
        reason: string
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `UPDATE fudaba_cards SET
                     publication_status=CASE WHEN review_status='pending'
                         AND publication_status='published'
                         THEN publication_status ELSE 'locked' END,
                     lock_reason=CASE WHEN review_status='pending'
                         AND publication_status='published'
                         THEN lock_reason ELSE ? END,
                     review_status=CASE WHEN review_status='pending'
                         THEN 'locked' ELSE review_status END,
                     review_reason=CASE WHEN review_status='pending'
                         THEN ? ELSE review_reason END,
                     revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                   AND (publication_status='pending'
                        OR (review_status='pending' AND publication_status='published'))
                 RETURNING ${NAMECARD_COLUMNS}, owner_account_id`,
                [reason, reason, id, expectedRevision]
            );
            if (updatedRow) {
                if (updatedRow.owner_account_id) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: String(updatedRow.owner_account_id),
                        cardNumber: id,
                        ...(updatedRow.publication_status === 'published'
                            ? cardRevisionFlaggedCopy(id, reason)
                            : cardLockedCopy(id, reason))
                    });
                }
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmission(id, database);
            if (!current) return { status: 'not-found' };
            if (current.status === 'withdrawn') {
                return { status: 'withdrawn', revision: current.revision };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    async listNamecardNotifications(recipientAccountId: string, limit: number) {
        return new SqlNamecardNotificationRepository(this.database).list(recipientAccountId, limit);
    }

    async markNamecardNotificationsRead(
        recipientAccountId: string,
        ids: readonly string[] | null
    ): Promise<number> {
        return new SqlNamecardNotificationRepository(this.database).markRead(recipientAccountId, ids);
    }

    async purgeTerminalCards(
        cutoff: Date
    ): Promise<Array<{ id: number; image1_url: string; image2_url: string | null }>> {
        const rows = await queryAll<{
            card_number: number | string;
            front_object_key: string;
            back_object_key: string | null;
        }>(this.database,
            `DELETE FROM fudaba_cards
             WHERE id IN (
                 SELECT card.id FROM fudaba_cards card
                 JOIN namecard_guest_attributes guest ON guest.card_id=card.id
                 WHERE card.publication_status IN ('withdrawn','rejected')
                   AND COALESCE(guest.withdrawn_at, guest.rejected_at, card.created_at) <= ?
             )
             RETURNING card_number, front_object_key, back_object_key`,
            [cutoff]
        );
        return rows.map((row) => ({
            id: Number(row.card_number),
            image1_url: namecardOriginalUrlFromObjectKey(row.front_object_key),
            image2_url:
                row.back_object_key === null
                    ? null
                    : namecardOriginalUrlFromObjectKey(row.back_object_key)
        }));
    }

    private async findSubmission(
        id: number,
        database: SqlDatabase = this.database
    ): Promise<NamecardSubmissionRecord | null> {
        const row = await queryOne<NamecardCardRow>(database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND deleted_at IS NULL`,
            [id]
        );
        return this.attachOneNamecard(database, row);
    }

    async findSubmissionByTokenHash(
        id: number,
        tokenHash: string,
        database: SqlDatabase = this.database
    ): Promise<NamecardSubmissionRecord | null> {
        const row = await queryOne<NamecardCardRow>(database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards card
             JOIN namecard_guest_attributes guest ON guest.card_id=card.id
             WHERE card.card_number=? AND card.${NAMECARD_COMPAT_ORIGIN}
               AND card.deleted_at IS NULL AND guest.withdrawal_token_hash=?`,
            [id, tokenHash]
        );
        return this.attachOneNamecard(database, row);
    }

    async findSubmissionWithHashesByTokenHash(
        id: number,
        tokenHash: string
    ): Promise<NamecardSubmissionWithHashesRecord | null> {
        const row = await queryOne<NamecardCardRow & { hash1: string; hash2: string }>(
            this.database,
            `SELECT ${NAMECARD_COLUMNS}, guest.hash1, guest.hash2
             FROM fudaba_cards card
             JOIN namecard_guest_attributes guest ON guest.card_id=card.id
             WHERE card.card_number=? AND card.${NAMECARD_COMPAT_ORIGIN}
               AND card.deleted_at IS NULL AND guest.withdrawal_token_hash=?`,
            [id, tokenHash]
        );
        if (!row) return null;
        const attached = await this.attachOneNamecard(this.database, row);
        if (!attached) return null;
        return { ...attached, hash1: row.hash1, hash2: row.hash2 };
    }

    async withdrawSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards card
                 SET publication_status='withdrawn', revision=revision+1,
                     updated_at=CURRENT_TIMESTAMP
                 FROM namecard_guest_attributes guest
                 WHERE guest.card_id=card.id AND card.card_number=?
                   AND card.${NAMECARD_COMPAT_ORIGIN}
                   AND guest.withdrawal_token_hash=? AND card.publication_status='pending'
                   AND card.revision=? AND card.deleted_at IS NULL
                 RETURNING card.id AS internal_id, card.card_number,
                           card.front_object_key, card.back_object_key,
                           card.publication_status, card.revision,
                           card.series_code, card.origin, card.created_at`,
                [id, tokenHash, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    'UPDATE namecard_guest_attributes SET withdrawn_at=CURRENT_TIMESTAMP WHERE card_id=?',
                    [updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmissionByTokenHash(id, tokenHash, database);
            if (!current) return { status: 'not-found' };
            return { status: 'conflict', revision: current.revision };
        });
    }

    async replaceSubmissionImage(
        id: number,
        tokenHash: string,
        expectedRevision: number,
        side: 'front' | 'back',
        imageUrl: string,
        hash: string
    ): Promise<NamecardEditResult> {
        const objectKeyColumn = side === 'front' ? 'front_object_key' : 'back_object_key';
        const hashColumn = side === 'front' ? 'hash1' : 'hash2';
        const key = publicMediaObjectKey(imageUrl);
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards card
                 SET ${objectKeyColumn}=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 FROM namecard_guest_attributes guest
                 WHERE guest.card_id=card.id AND card.card_number=?
                   AND card.${NAMECARD_COMPAT_ORIGIN}
                   AND guest.withdrawal_token_hash=?
                   AND card.publication_status IN ('withdrawn','rejected')
                   AND card.revision=? AND card.deleted_at IS NULL
                 RETURNING card.id AS internal_id, card.card_number,
                           card.front_object_key, card.back_object_key,
                           card.publication_status, card.revision,
                           card.series_code, card.origin, card.created_at`,
                [key, id, tokenHash, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    `UPDATE namecard_guest_attributes SET ${hashColumn}=? WHERE card_id=?`,
                    [hash, updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmissionByTokenHash(id, tokenHash, database);
            if (!current) return { status: 'not-found' };
            return { status: 'conflict', revision: current.revision };
        });
    }

    async resubmitSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardEditResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards card
                 SET publication_status='pending', revision=revision+1,
                     updated_at=CURRENT_TIMESTAMP
                 FROM namecard_guest_attributes guest
                 WHERE guest.card_id=card.id AND card.card_number=?
                   AND card.${NAMECARD_COMPAT_ORIGIN}
                   AND guest.withdrawal_token_hash=?
                   AND card.publication_status IN ('withdrawn','rejected')
                   AND card.revision=? AND card.deleted_at IS NULL
                 RETURNING card.id AS internal_id, card.card_number,
                           card.front_object_key, card.back_object_key,
                           card.publication_status, card.revision,
                           card.series_code, card.origin, card.created_at`,
                [id, tokenHash, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    `UPDATE namecard_guest_attributes
                     SET withdrawn_at=NULL, rejected_at=NULL WHERE card_id=?`,
                    [updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmissionByTokenHash(id, tokenHash, database);
            if (!current) return { status: 'not-found' };
            return { status: 'conflict', revision: current.revision };
        });
    }

    async findCardByMediaUrl(url: string): Promise<CardMediaRecord | null> {
        let key: string;
        try {
            key = publicMediaObjectKey(url);
        } catch {
            return null;
        }
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE (front_object_key=? OR back_object_key=?) AND ${NAMECARD_COMPAT_ORIGIN}
               AND deleted_at IS NULL LIMIT 1`,
            [key, key]
        );
        return this.attachOneNamecard(this.database, row);
    }

}
