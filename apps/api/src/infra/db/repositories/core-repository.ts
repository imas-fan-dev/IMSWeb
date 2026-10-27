import { adminExchangePath } from '@imsweb/contracts/paths';
import { NAMECARD_FAVORITE_CHARACTER_LIMIT } from '@imsweb/contracts/fudaba/runtime';
import {
    insertNamecardNotification,
    SqlNamecardNotificationRepository
} from '@/infra/db/repositories/namecard-notification-repository';
import {
    cardApprovedCopy,
    cardLockedCopy,
    cardRejectedCopy,
    cardRevisionFlaggedCopy,
    cardRevisionRejectedCopy,
    cardUnlockedCopy,
} from '@/infra/db/repositories/namecard-notification-copy';
import type {
    CardFavoriteSelectionRecord,
    CardMediaRecord,
    NamecardRepository,
    NamecardApprovalClaim,
    NamecardEditResult,
    NamecardMutationResult,
    NamecardAdminFilter,
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

type NamecardSubmissionRow = Omit<NamecardSubmissionRecord, 'favorite_characters'>;

type NamecardFavoriteRow = {
    card_id: number | string;
    character_id: number | string;
    agency_code: string;
    name_cn: string;
    display_order: number | string;
};

// The legacy/guest compatibility surface (numeric card_number ids) only ever
// covers rows unified from the anonymous namecard flow; exchange-owned cards
// keep their own TEXT-id routes through the Fudaba domain.
const NAMECARD_COMPAT_ORIGIN = "origin IN ('guest', 'legacy')";
// The public wall serves anonymous submissions plus any card whose media has
// been copied into the canonical namecard layout -- which approval does for
// registered-user uploads. Rows that still point at the Fudaba layout are kept
// out so the public thumbnail reversal never sees a key it cannot read.
const NAMECARD_PUBLIC_ORIGIN =
    "(origin IN ('guest', 'legacy') OR front_object_key LIKE 'community/namecards/assets/%')";

const NAMECARD_COLUMNS = `id AS internal_id, card_number, front_object_key,
    back_object_key, publication_status, revision, series_code, origin,
    display_name, producer_name, lock_reason, created_at, review_status,
    review_reason, pending_payload, pending_front_object_key,
    pending_back_object_key`;

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
            "(COALESCE(display_name, '') ILIKE ? ESCAPE '\\' OR COALESCE(producer_name, '') ILIKE ? ESCAPE '\\')"
        );
        values.push(pattern, pattern);
    }
    return { sql: clauses.join(' AND '), values };
}

type NamecardCardRow = {
    internal_id: string;
    card_number: number | string;
    front_object_key: string;
    back_object_key: string;
    publication_status: string;
    revision: number | string;
    series_code: string | null;
    origin: string;
    display_name?: string | null;
    producer_name?: string | null;
    lock_reason?: string | null;
    review_status?: string | null;
    review_reason?: string | null;
    pending_payload?: unknown;
    pending_front_object_key?: string | null;
    pending_back_object_key?: string | null;
    created_at: string | Date | null;
};

// A revision waiting for review keeps the live columns untouched; reviewers and
// the owner both read the submitted copy through this projection instead.
type NamecardPendingPayload = {
    display_name?: string | null;
    producer_name?: string | null;
    series_code?: string | null;
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

    private namecardRecordFromRow(row: NamecardCardRow): NamecardSubmissionRow {
        // Exchange rows keep the Fudaba object layout until approval copies the
        // images into the canonical namecard layout, so pending ones are served
        // through the authenticated moderation media route. Once the canonical
        // key is written, the regular reversal applies and the row behaves like
        // any other namecard.
        const media = (key: string, side: 'front' | 'back'): string =>
            row.origin === 'exchange' && !key.startsWith('community/namecards/assets/')
                ? exchangeReviewMediaUrl(key, side)
                : namecardOriginalUrlFromObjectKey(key);
        const staged = row.review_status === 'pending';
        const payload = staged ? pendingNamecardPayload(row.pending_payload) : null;
        return {
            id: Number(row.card_number),
            image1_url: media(
                (staged ? row.pending_front_object_key : null) ?? row.front_object_key,
                'front'
            ),
            image2_url: media(
                (staged ? row.pending_back_object_key : null) ?? row.back_object_key,
                'back'
            ),
            // A pending revision is a queue item even though the live copy is
            // still published; the wall reads the database directly and is not
            // affected by how the queue labels the card.
            status: staged ? 'pending' : toLegacyNamecardStatus(row.publication_status),
            revision: Number(row.revision),
            series_code: payload?.series_code ?? row.series_code,
            submission_kind: row.origin === 'guest' ? 'guest' : 'legacy',
            lockReason: row.lock_reason ?? null,
            reviewStatus: staged ? 'pending' : toNamecardReviewStatus(row.review_status),
            reviewReason: row.review_reason ?? null,
            created_at: row.created_at
        };
    }

    private async attachNamecardFavorites(
        database: SqlDatabase,
        rows: readonly NamecardCardRow[]
    ): Promise<Array<NamecardSubmissionRow & { favorite_characters: CardFavoriteSelectionRecord[] }>> {
        const characters = await this.listNamecardFavorites(database, rows.map((row) => row.internal_id));
        return rows.map((row) => {
            const favoriteCharacters = characters.get(row.internal_id) ?? [];
            const record = this.namecardRecordFromRow(row);
            const payload =
                row.review_status === 'pending'
                    ? pendingNamecardPayload(row.pending_payload)
                    : null;
            return {
                ...record,
                origin: row.origin,
                display_name: payload?.display_name ?? row.display_name ?? null,
                producer_name: payload?.producer_name ?? row.producer_name ?? null,
                favorite_characters: favoriteCharacters,
                seriesCode: record.series_code ?? null,
                submissionKind: record.submission_kind ?? 'legacy',
                favoriteCharacters
            };
        });
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
        const backKey = publicMediaObjectKey(input.image2Url);
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
                    (id, card_number, origin, series_code, producer_name,
                     display_name, front_object_key, back_object_key, accent,
                     bio, trade_note, available,
                     publication_status, revision, created_at, updated_at)
                 SELECT ? || '-' || allocated.card_number::text, allocated.card_number,
                        ?, ?, ?, ?, ?, ?, ?, ?, NULL, FALSE, 'pending',
                        0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                 FROM allocated
                 RETURNING id, card_number`,
                [
                    idPrefix,
                    idPrefix,
                    input.seriesCode ?? null,
                    input.producerName ?? null,
                    input.displayName ?? null,
                    frontKey,
                    backKey,
                    input.accent ?? null,
                    input.bio ?? null
                ]
            );
            if (!created) throw new Error('Card insert did not return an ID');
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
        return await this.attachNamecardFavorites(this.database, rows) as NamecardPublicRecord[];
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
        await executeSql(database,
            `UPDATE fudaba_cards
             SET display_name=?, producer_name=?, series_code=?,
                 front_object_key=COALESCE(pending_front_object_key, front_object_key),
                 back_object_key=COALESCE(pending_back_object_key, back_object_key),
                 publication_status='published', rejection_reason=NULL,
                 review_status=NULL, review_reason=NULL, review_submitted_at=NULL,
                 pending_payload=NULL, pending_front_object_key=NULL,
                 pending_back_object_key=NULL,
                 revision=revision+1, updated_at=CURRENT_TIMESTAMP
             WHERE id=?`,
            [
                payload?.display_name ?? row.display_name ?? null,
                payload?.producer_name ?? row.producer_name ?? null,
                payload?.series_code ?? row.series_code ?? null,
                row.internal_id
            ]
        );
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

    async findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.findSubmission(id);
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
    ): Promise<Array<{ id: number; image1_url: string; image2_url: string }>> {
        const rows = await queryAll<{
            card_number: number | string;
            front_object_key: string;
            back_object_key: string;
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
            image2_url: namecardOriginalUrlFromObjectKey(row.back_object_key)
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
