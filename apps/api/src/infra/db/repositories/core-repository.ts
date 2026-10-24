import { NAMECARD_FAVORITE_CHARACTER_LIMIT } from '@imsweb/contracts/fudaba/runtime';
import type {
    CardFavoriteSelectionRecord,
    CardMediaRecord,
    NamecardRepository,
    NamecardApprovalClaim,
    NamecardEditResult,
    NamecardMutationResult,
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

const NAMECARD_COLUMNS = `id AS internal_id, card_number, front_object_key,
    back_object_key, publication_status, revision, series_code, origin,
    created_at`;

type NamecardCardRow = {
    internal_id: string;
    card_number: number | string;
    front_object_key: string;
    back_object_key: string;
    publication_status: string;
    revision: number | string;
    series_code: string | null;
    origin: string;
    created_at: string | Date | null;
};

function toLegacyNamecardStatus(status: string): NamecardSubmissionRecord['status'] {
    return (status === 'published' ? 'approved' : status) as NamecardSubmissionRecord['status'];
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
        return {
            id: Number(row.card_number),
            image1_url: namecardOriginalUrlFromObjectKey(row.front_object_key),
            image2_url: namecardOriginalUrlFromObjectKey(row.back_object_key),
            status: toLegacyNamecardStatus(row.publication_status),
            revision: Number(row.revision),
            series_code: row.series_code,
            submission_kind: row.origin === 'guest' ? 'guest' : 'legacy',
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
            return {
                ...record,
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
                     bio, trade_note, available, media_rights_status,
                     publication_status, revision, created_at, updated_at)
                 SELECT ? || '-' || allocated.card_number::text, allocated.card_number,
                        ?, ?, ?, ?, ?, ?, ?, ?, NULL, FALSE, 'unknown', 'pending',
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
        const row = await queryOne<{ total: number }>(this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM fudaba_cards
             WHERE ${NAMECARD_COMPAT_ORIGIN} AND publication_status='published'
               AND deleted_at IS NULL`
        );
        return row?.total ?? 0;
    }

    async countAdminCards(): Promise<number> {
        const row = await queryOne<{ total: number }>(this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM fudaba_cards
             WHERE ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status NOT IN ('withdrawn','rejected')
               AND deleted_at IS NULL`
        );
        return row?.total ?? 0;
    }

    async listApprovedCards(limit: number, offset: number): Promise<NamecardPublicRecord[]> {
        const rows = await queryAll<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE ${NAMECARD_COMPAT_ORIGIN} AND publication_status='published'
               AND deleted_at IS NULL
             ORDER BY card_number DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        return await this.attachNamecardFavorites(this.database, rows) as NamecardPublicRecord[];
    }

    async findApprovedCardMedia(id: number): Promise<CardMediaRecord | null> {
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status='published' AND deleted_at IS NULL`,
            [id]
        );
        return this.attachOneNamecard(this.database, row);
    }

    async listAdminCards(limit: number, offset: number): Promise<NamecardSubmissionRecord[]> {
        const rows = await queryAll<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status NOT IN ('withdrawn','rejected')
               AND deleted_at IS NULL
             ORDER BY card_number DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        return this.attachNamecardFavorites(this.database, rows);
    }

    async beginCardApproval(
        id: number,
        expectedRevision: number
    ): Promise<NamecardApprovalClaim> {
        const claimedRow = await queryOne<NamecardCardRow>(this.database,
            `UPDATE fudaba_cards SET publication_status='approving', revision=revision+1,
                    updated_at=CURRENT_TIMESTAMP
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status='pending' AND revision=? AND deleted_at IS NULL
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
            current.status === 'approving' &&
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
        const updatedRow = await queryOne<NamecardCardRow>(this.database,
            `UPDATE fudaba_cards
             SET publication_status='published', media_rights_status='approved',
                 revision=revision+1, updated_at=CURRENT_TIMESTAMP
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status='approving' AND revision=? AND deleted_at IS NULL
             RETURNING ${NAMECARD_COLUMNS}`,
            [id, approvingRevision]
        );
        const updated = await this.attachOneNamecard(this.database, updatedRow);
        if (updated) return { status: 'updated', card: updated };
        const current = await this.findSubmission(id);
        if (!current) return { status: 'not-found' };
        if (current.status === 'approved' && current.revision === approvingRevision + 1) {
            return { status: 'updated', card: current };
        }
        return { status: 'conflict', revision: current.revision };
    }

    async findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.findSubmission(id);
    }

    async deleteCard(id: number, expectedRevision: number): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const currentRow = await queryOne<NamecardCardRow>(database,
                `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
                 WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN} AND deleted_at IS NULL
                 FOR UPDATE`,
                [id]
            );
            const current = await this.attachOneNamecard(database, currentRow);
            if (!current) return { status: 'not-found' };
            if (current.revision !== expectedRevision) {
                return { status: 'conflict', revision: current.revision };
            }
            const deleted = await executeSql(
                database,
                `DELETE FROM fudaba_cards WHERE card_number=? AND revision=? AND ${NAMECARD_COMPAT_ORIGIN}`,
                [id, expectedRevision]
            );
            return deleted.meta.changes === 1
                ? { status: 'updated', card: current }
                : { status: 'conflict', revision: current.revision };
        });
    }

    async rejectSubmission(
        id: number,
        expectedRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards SET publication_status='rejected', revision=revision+1,
                        updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
                   AND publication_status='pending' AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}`,
                [id, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    'UPDATE namecard_guest_attributes SET rejected_at=CURRENT_TIMESTAMP WHERE card_id=?',
                    [updatedRow.internal_id]
                );
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
                 WHERE card.${NAMECARD_COMPAT_ORIGIN}
                   AND card.publication_status IN ('withdrawn','rejected')
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
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN} AND deleted_at IS NULL`,
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
