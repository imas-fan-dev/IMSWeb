import type {
    CreateOwnedFudabaCardInput,
    FudabaCardRecord,
    FudabaCardMutationResult,
    FudabaExchangeRequestRecord,
    FudabaModerationCaseRecord,
    FudabaOfficeRecord,
    FudabaPublicCardRecord,
    FudabaPublicOfficeDetailRecord,
    FudabaPublicOfficeRecord,
    FudabaPublicPlacedCardRecord,
    FudabaPublicSeriesRecord,
    FudabaRepository,
    ListFudabaPublicCardsInput,
    ListFudabaPublicOfficesInput,
    NewFudabaCardInput,
    NewFudabaModerationCaseInput,
    NewFudabaOfficeInput,
    SoftDeleteOwnedFudabaCardInput,
    UpdateOwnedFudabaCardMediaInput,
    UpdateOwnedFudabaCardMetadataInput
} from '@/ports/repositories';
import type {
    ManagedSqlDatabase,
    SqlSchemaStrategy
} from '@/infra/db/sql/database';
import {
    executeSql,
    queryAll,
    queryOne,
    sqlStatement
} from '@/infra/db/sql/query';

const OFFICE_COLUMNS = `id, owner_account_id, slug, name, intro, city, address,
    latitude, longitude, accent, cover_object_key, is_open, visitor_count,
    status, revision, created_at, updated_at, archived_at`;
const CARD_COLUMNS = `id, owner_account_id, producer_name, display_name,
    series_code, favorite_idol, front_object_key, back_object_key, accent, bio,
    trade_note, available, source_url, source_label, source_credit,
    media_rights_status, publication_status, revision, created_at, updated_at,
    deleted_at`;
const EXCHANGE_COLUMNS = `id, office_id, requester_account_id,
    recipient_account_id, wanted_card_id, offered_card_id, note, status,
    version, created_at, updated_at, resolved_at`;
const MODERATION_COLUMNS = `id, resource_kind, resource_id,
    reporter_account_id, reason, details, state, backoffice_actor_id,
    resolution, created_at, updated_at, resolved_at`;
const PUBLIC_OFFICE_COLUMNS = `office.id, office.slug, office.name, office.intro,
    office.city, office.accent, office.cover_object_key, office.is_open,
    office.visitor_count`;
const PUBLIC_CARD_COLUMNS = `card.id, card.producer_name, card.display_name,
    card.series_code, card.favorite_idol, card.front_object_key,
    card.back_object_key, card.accent, card.bio, card.trade_note, card.available,
    card.source_url, card.source_label, card.source_credit, card.created_at,
    (SELECT COUNT(*) FROM fudaba_card_likes card_like
     WHERE card_like.card_id=card.id) AS like_count,
    (SELECT COUNT(*) FROM fudaba_card_favorites card_favorite
     WHERE card_favorite.card_id=card.id) AS favorite_count,
    EXISTS (
        SELECT 1 FROM fudaba_card_likes viewer_like
        WHERE viewer_like.card_id=card.id AND viewer_like.account_id=?
    ) AS viewer_liked,
    EXISTS (
        SELECT 1 FROM fudaba_card_favorites viewer_favorite
        WHERE viewer_favorite.card_id=card.id AND viewer_favorite.account_id=?
    ) AS viewer_favorited`;
const PUBLIC_OFFICE_ELIGIBILITY = `office.status='active'
    AND office_owner.status IN ('active', 'restricted')
    AND office_owner.deleted_at IS NULL`;
const PUBLIC_CARD_ELIGIBILITY = `card.publication_status='published'
    AND card.media_rights_status='approved' AND card.deleted_at IS NULL
    AND card_owner.status IN ('active', 'restricted')
    AND card_owner.deleted_at IS NULL`;

type TimestampValue = string | Date;

type FudabaOfficeRow = Omit<
    FudabaOfficeRecord,
    'is_open' | 'visitor_count' | 'revision' | 'created_at' | 'updated_at' | 'archived_at'
> & {
    is_open: boolean | number | string;
    visitor_count: number | string;
    revision: number | string;
    created_at: TimestampValue;
    updated_at: TimestampValue;
    archived_at: TimestampValue | null;
};

type FudabaCardRow = Omit<
    FudabaCardRecord,
    'available' | 'revision' | 'created_at' | 'updated_at' | 'deleted_at'
> & {
    available: boolean | number | string;
    revision: number | string;
    created_at: TimestampValue;
    updated_at: TimestampValue;
    deleted_at: TimestampValue | null;
};

type FudabaExchangeRequestRow = Omit<
    FudabaExchangeRequestRecord,
    'version' | 'created_at' | 'updated_at' | 'resolved_at'
> & {
    version: number | string;
    created_at: TimestampValue;
    updated_at: TimestampValue;
    resolved_at: TimestampValue | null;
};

type FudabaModerationCaseRow = Omit<
    FudabaModerationCaseRecord,
    'backoffice_actor_id' | 'created_at' | 'updated_at' | 'resolved_at'
> & {
    backoffice_actor_id: number | string | null;
    created_at: TimestampValue;
    updated_at: TimestampValue;
    resolved_at: TimestampValue | null;
};

type FudabaPublicSeriesRow = Omit<
    FudabaPublicSeriesRecord,
    'display_order' | 'active_office_count'
> & {
    display_order: number | string;
    active_office_count: number | string;
};

type FudabaPublicOfficeRow = Omit<
    FudabaPublicOfficeRecord,
    'is_open' | 'visitor_count' | 'series_codes'
> & {
    is_open: boolean | number | string;
    visitor_count: number | string;
};

type FudabaOfficeSeriesRow = {
    office_id: string;
    series_code: string;
};

type FudabaPublicCardRow = Omit<
    FudabaPublicCardRecord,
    | 'available'
    | 'created_at'
    | 'like_count'
    | 'favorite_count'
    | 'viewer_liked'
    | 'viewer_favorited'
> & {
    available: boolean | number | string;
    created_at: TimestampValue;
    like_count: number | string;
    favorite_count: number | string;
    viewer_liked: boolean | number | string;
    viewer_favorited: boolean | number | string;
};

type FudabaPublicPlacedCardRow = FudabaPublicCardRow & {
    pinned_at: TimestampValue;
    position_x: number | string;
    position_y: number | string;
    rotation: number | string;
    z_index: number | string;
};

function booleanValue(value: boolean | number | string): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function timestampValue(value: TimestampValue): string {
    return value instanceof Date ? value.toISOString() : value;
}

function nullableTimestampValue(value: TimestampValue | null): string | null {
    return value === null ? null : timestampValue(value);
}

function officeRecord(row: FudabaOfficeRow): FudabaOfficeRecord {
    return {
        ...row,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        is_open: booleanValue(row.is_open),
        visitor_count: Number(row.visitor_count),
        revision: Number(row.revision),
        created_at: timestampValue(row.created_at),
        updated_at: timestampValue(row.updated_at),
        archived_at: nullableTimestampValue(row.archived_at)
    };
}

function cardRecord(row: FudabaCardRow): FudabaCardRecord {
    return {
        ...row,
        available: booleanValue(row.available),
        revision: Number(row.revision),
        created_at: timestampValue(row.created_at),
        updated_at: timestampValue(row.updated_at),
        deleted_at: nullableTimestampValue(row.deleted_at)
    };
}

function exchangeRecord(row: FudabaExchangeRequestRow): FudabaExchangeRequestRecord {
    return {
        ...row,
        version: Number(row.version),
        created_at: timestampValue(row.created_at),
        updated_at: timestampValue(row.updated_at),
        resolved_at: nullableTimestampValue(row.resolved_at)
    };
}

function moderationRecord(row: FudabaModerationCaseRow): FudabaModerationCaseRecord {
    return {
        ...row,
        backoffice_actor_id: row.backoffice_actor_id === null
            ? null
            : Number(row.backoffice_actor_id),
        created_at: timestampValue(row.created_at),
        updated_at: timestampValue(row.updated_at),
        resolved_at: nullableTimestampValue(row.resolved_at)
    };
}

function publicSeriesRecord(row: FudabaPublicSeriesRow): FudabaPublicSeriesRecord {
    return {
        code: row.code,
        display_name: row.display_name,
        display_order: Number(row.display_order),
        active_office_count: Number(row.active_office_count)
    };
}

function publicOfficeRecord(
    row: FudabaPublicOfficeRow,
    seriesCodes: string[]
): FudabaPublicOfficeRecord {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        intro: row.intro,
        city: row.city,
        accent: row.accent,
        cover_object_key: row.cover_object_key,
        is_open: booleanValue(row.is_open),
        visitor_count: Number(row.visitor_count),
        series_codes: seriesCodes
    };
}

function publicCardRecord(row: FudabaPublicCardRow): FudabaPublicCardRecord {
    return {
        id: row.id,
        producer_name: row.producer_name,
        display_name: row.display_name,
        series_code: row.series_code,
        favorite_idol: row.favorite_idol,
        front_object_key: row.front_object_key,
        back_object_key: row.back_object_key,
        accent: row.accent,
        bio: row.bio,
        trade_note: row.trade_note,
        available: booleanValue(row.available),
        source_url: row.source_url,
        source_label: row.source_label,
        source_credit: row.source_credit,
        created_at: timestampValue(row.created_at),
        like_count: Number(row.like_count),
        favorite_count: Number(row.favorite_count),
        viewer_liked: booleanValue(row.viewer_liked),
        viewer_favorited: booleanValue(row.viewer_favorited)
    };
}

function publicPlacedCardRecord(
    row: FudabaPublicPlacedCardRow
): FudabaPublicPlacedCardRecord {
    return {
        ...publicCardRecord(row),
        pinned_at: timestampValue(row.pinned_at),
        position_x: Number(row.position_x),
        position_y: Number(row.position_y),
        rotation: Number(row.rotation),
        z_index: Number(row.z_index)
    };
}

export class SqlFudabaRepository implements FudabaRepository {
    private initialized?: Promise<void>;
    private writeTail: Promise<void> = Promise.resolve();

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly schema: SqlSchemaStrategy
    ) {}

    initialize(): Promise<void> {
        this.initialized ??= this.schema.initializeFudaba(this.database);
        return this.initialized;
    }

    close(): Promise<void> {
        return this.database.close();
    }

    private serializeWrite<Value>(operation: () => Promise<Value>): Promise<Value> {
        const result = this.writeTail.then(operation, operation);
        this.writeTail = result.then(() => undefined, () => undefined);
        return result;
    }

    private bindBoolean(value: boolean): boolean {
        return value;
    }

    private async attachOfficeSeries(
        rows: FudabaPublicOfficeRow[]
    ): Promise<FudabaPublicOfficeRecord[]> {
        if (rows.length === 0) return [];
        const seriesByOffice = new Map<string, string[]>(
            rows.map((row) => [row.id, []])
        );
        const placeholders = rows.map(() => '?').join(', ');
        const seriesRows = await queryAll<FudabaOfficeSeriesRow>(
            this.database,
            `SELECT office_id, series_code
             FROM fudaba_office_series_tags office_series
             JOIN fudaba_series_tags series
               ON series.code=office_series.series_code AND series.enabled
             WHERE office_id IN (${placeholders})
             ORDER BY office_id, office_series.display_order, series_code`,
            rows.map((row) => row.id)
        );
        for (const series of seriesRows) {
            seriesByOffice.get(series.office_id)?.push(series.series_code);
        }
        return rows.map((row) => publicOfficeRecord(
            row,
            seriesByOffice.get(row.id) ?? []
        ));
    }

    async listPublicSeries(): Promise<FudabaPublicSeriesRecord[]> {
        const rows = await queryAll<FudabaPublicSeriesRow>(
            this.database,
            `SELECT series.code, series.display_name, series.display_order,
                    COUNT(office_owner.id) AS active_office_count
             FROM fudaba_series_tags series
             LEFT JOIN fudaba_office_series_tags office_series
               ON office_series.series_code=series.code
             LEFT JOIN fudaba_offices office
               ON office.id=office_series.office_id AND office.status='active'
             LEFT JOIN platform_accounts office_owner
               ON office_owner.id=office.owner_account_id
              AND office_owner.status IN ('active', 'restricted')
              AND office_owner.deleted_at IS NULL
             WHERE series.enabled=?
             GROUP BY series.code, series.display_name, series.display_order
             ORDER BY series.display_order, series.code`,
            [this.bindBoolean(true)]
        );
        return rows.map(publicSeriesRecord);
    }

    async listPublicOffices(
        input: ListFudabaPublicOfficesInput
    ): Promise<FudabaPublicOfficeRecord[]> {
        const conditions = [PUBLIC_OFFICE_ELIGIBILITY];
        const parameters: unknown[] = [];
        if (input.city !== undefined) {
            conditions.push('office.city=?');
            parameters.push(input.city);
        }
        if (input.seriesCode !== undefined) {
            conditions.push(`EXISTS (
                SELECT 1 FROM fudaba_office_series_tags series_filter
                JOIN fudaba_series_tags series
                  ON series.code=series_filter.series_code AND series.enabled
                WHERE series_filter.office_id=office.id
                  AND series_filter.series_code=?
            )`);
            parameters.push(input.seriesCode);
        }
        if (input.isOpen !== undefined) {
            conditions.push('office.is_open=?');
            parameters.push(this.bindBoolean(input.isOpen));
        }
        if (input.after) {
            conditions.push(`(
                office.visitor_count<? OR (
                    office.visitor_count=? AND office.id>?
                )
            )`);
            parameters.push(
                input.after.visitorCount,
                input.after.visitorCount,
                input.after.id
            );
        }
        parameters.push(input.limit);
        const rows = await queryAll<FudabaPublicOfficeRow>(
            this.database,
            `SELECT ${PUBLIC_OFFICE_COLUMNS}
             FROM fudaba_offices office
             JOIN platform_accounts office_owner
               ON office_owner.id=office.owner_account_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY office.visitor_count DESC, office.id ASC
             LIMIT ?`,
            parameters
        );
        return this.attachOfficeSeries(rows);
    }

    async findPublicOfficeBySlug(
        slug: string,
        viewerAccountId: string | null
    ): Promise<FudabaPublicOfficeDetailRecord | null> {
        const row = await queryOne<FudabaPublicOfficeRow>(
            this.database,
            `SELECT ${PUBLIC_OFFICE_COLUMNS}
             FROM fudaba_offices office
             JOIN platform_accounts office_owner
               ON office_owner.id=office.owner_account_id
             WHERE office.slug=? AND ${PUBLIC_OFFICE_ELIGIBILITY}`,
            [slug]
        );
        if (!row) return null;
        const [office] = await this.attachOfficeSeries([row]);
        const cardRows = await queryAll<FudabaPublicPlacedCardRow>(
            this.database,
            `SELECT ${PUBLIC_CARD_COLUMNS}, placement.pinned_at,
                    placement.position_x, placement.position_y,
                    placement.rotation, placement.z_index
             FROM fudaba_office_cards placement
             JOIN fudaba_cards card ON card.id=placement.card_id
             JOIN platform_accounts card_owner
               ON card_owner.id=card.owner_account_id
             JOIN fudaba_series_tags card_series
               ON card_series.code=card.series_code AND card_series.enabled
             WHERE placement.office_id=? AND ${PUBLIC_CARD_ELIGIBILITY}
             ORDER BY placement.z_index ASC, placement.pinned_at ASC, card.id ASC`,
            [viewerAccountId, viewerAccountId, row.id]
        );
        return {
            ...office,
            cards: cardRows.map(publicPlacedCardRecord)
        };
    }

    async listPublicCards(
        input: ListFudabaPublicCardsInput
    ): Promise<FudabaPublicCardRecord[]> {
        const conditions = [PUBLIC_CARD_ELIGIBILITY];
        const parameters: unknown[] = [
            input.viewerAccountId,
            input.viewerAccountId
        ];
        if (input.seriesCode !== undefined) {
            conditions.push('card.series_code=?');
            parameters.push(input.seriesCode);
        }
        if (input.available !== undefined) {
            conditions.push('card.available=?');
            parameters.push(this.bindBoolean(input.available));
        }
        if (input.officeSlug !== undefined) {
            conditions.push(`EXISTS (
                SELECT 1 FROM fudaba_office_cards office_card
                JOIN fudaba_offices office ON office.id=office_card.office_id
                JOIN platform_accounts office_filter_owner
                  ON office_filter_owner.id=office.owner_account_id
                WHERE office_card.card_id=card.id AND office.slug=?
                  AND office.status='active'
                  AND office_filter_owner.status IN ('active', 'restricted')
                  AND office_filter_owner.deleted_at IS NULL
            )`);
            parameters.push(input.officeSlug);
        }
        if (input.after) {
            conditions.push(`(
                card.created_at<? OR (
                    card.created_at=? AND card.id<?
                )
            )`);
            parameters.push(
                input.after.createdAt,
                input.after.createdAt,
                input.after.id
            );
        }
        parameters.push(input.limit);
        const rows = await queryAll<FudabaPublicCardRow>(
            this.database,
            `SELECT ${PUBLIC_CARD_COLUMNS}
             FROM fudaba_cards card
             JOIN platform_accounts card_owner
               ON card_owner.id=card.owner_account_id
             JOIN fudaba_series_tags card_series
               ON card_series.code=card.series_code AND card_series.enabled
             WHERE ${conditions.join(' AND ')}
             ORDER BY card.created_at DESC, card.id DESC
             LIMIT ?`,
            parameters
        );
        return rows.map(publicCardRecord);
    }

    createOffice(input: NewFudabaOfficeInput): Promise<FudabaOfficeRecord> {
        return this.serializeWrite(async () => {
            const statements = [
                sqlStatement(
                    this.database,
                    `INSERT INTO fudaba_offices
                        (id, owner_account_id, slug, name, intro, city, address,
                         latitude, longitude, accent, cover_object_key, is_open,
                         visitor_count, status, revision, created_at, updated_at,
                         archived_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        input.id,
                        input.ownerAccountId,
                        input.slug,
                        input.name,
                        input.intro,
                        input.city,
                        input.address,
                        input.latitude,
                        input.longitude,
                        input.accent,
                        input.coverObjectKey,
                        this.bindBoolean(input.isOpen),
                        input.visitorCount,
                        input.status,
                        input.revision,
                        input.createdAt,
                        input.updatedAt,
                        input.archivedAt
                    ]
                ),
                ...input.seriesCodes.map((seriesCode, displayOrder) => sqlStatement(
                    this.database,
                    `INSERT INTO fudaba_office_series_tags
                        (office_id, series_code, display_order)
                     VALUES (?, ?, ?)`,
                    [input.id, seriesCode, displayOrder]
                ))
            ];
            await this.database.batch(statements);
            const created = await this.findOfficeById(input.id);
            if (!created) throw new Error('Fudaba office was not created');
            return created;
        });
    }

    async findOfficeById(id: string): Promise<FudabaOfficeRecord | null> {
        const row = await queryOne<FudabaOfficeRow>(
            this.database,
            `SELECT ${OFFICE_COLUMNS} FROM fudaba_offices WHERE id=?`,
            [id]
        );
        return row ? officeRecord(row) : null;
    }

    updateOfficeStatusForOwner(input: {
        officeId: string;
        ownerAccountId: string;
        status: FudabaOfficeRecord['status'];
        archivedAt: string | null;
        updatedAt: string;
        expectedRevision: number;
    }): Promise<boolean> {
        return this.serializeWrite(async () => {
            const result = await executeSql(
                this.database,
                `UPDATE fudaba_offices
                 SET status=?, archived_at=?, updated_at=?, revision=revision+1
                 WHERE id=? AND owner_account_id=? AND revision=?`,
                [
                    input.status,
                    input.archivedAt,
                    input.updatedAt,
                    input.officeId,
                    input.ownerAccountId,
                    input.expectedRevision
                ]
            );
            return result.meta.changes === 1;
        });
    }

    createCard(input: NewFudabaCardInput): Promise<FudabaCardRecord> {
        return this.serializeWrite(async () => {
            await executeSql(
                this.database,
                `INSERT INTO fudaba_cards
                    (id, owner_account_id, producer_name, display_name,
                     series_code, favorite_idol, front_object_key, back_object_key,
                     accent, bio, trade_note, available, source_url, source_label,
                     source_credit, media_rights_status, publication_status,
                     revision, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    input.id,
                    input.ownerAccountId,
                    input.producerName,
                    input.displayName,
                    input.seriesCode,
                    input.favoriteIdol,
                    input.frontObjectKey,
                    input.backObjectKey,
                    input.accent,
                    input.bio,
                    input.tradeNote,
                    this.bindBoolean(input.available),
                    input.sourceUrl,
                    input.sourceLabel,
                    input.sourceCredit,
                    input.mediaRightsStatus,
                    input.publicationStatus,
                    input.revision,
                    input.createdAt,
                    input.updatedAt,
                    input.deletedAt
                ]
            );
            const created = await this.findCardById(input.id);
            if (!created) throw new Error('Fudaba card was not created');
            return created;
        });
    }

    async findCardById(id: string): Promise<FudabaCardRecord | null> {
        const row = await queryOne<FudabaCardRow>(
            this.database,
            `SELECT ${CARD_COLUMNS} FROM fudaba_cards WHERE id=?`,
            [id]
        );
        return row ? cardRecord(row) : null;
    }

    async listCardsForOwner(ownerAccountId: string): Promise<FudabaCardRecord[]> {
        const rows = await queryAll<FudabaCardRow>(
            this.database,
            `SELECT ${CARD_COLUMNS}
             FROM fudaba_cards
             WHERE owner_account_id=? AND deleted_at IS NULL
             ORDER BY created_at DESC, id DESC`,
            [ownerAccountId]
        );
        return rows.map(cardRecord);
    }

    async findCardForOwner(
        cardId: string,
        ownerAccountId: string
    ): Promise<FudabaCardRecord | null> {
        const row = await queryOne<FudabaCardRow>(
            this.database,
            `SELECT ${CARD_COLUMNS}
             FROM fudaba_cards
             WHERE id=? AND owner_account_id=? AND deleted_at IS NULL`,
            [cardId, ownerAccountId]
        );
        return row ? cardRecord(row) : null;
    }

    private async findActiveCardForOwner(
        cardId: string,
        ownerAccountId: string
    ): Promise<FudabaCardRecord | null> {
        const row = await queryOne<FudabaCardRow>(
            this.database,
            `SELECT ${CARD_COLUMNS}
             FROM fudaba_cards
             WHERE id=? AND owner_account_id=? AND deleted_at IS NULL
               AND EXISTS (
                   SELECT 1 FROM platform_accounts account
                   WHERE account.id=fudaba_cards.owner_account_id
                     AND account.status='active' AND account.deleted_at IS NULL
               )`,
            [cardId, ownerAccountId]
        );
        return row ? cardRecord(row) : null;
    }

    private cardWriteFailure(
        current: FudabaCardRecord | null,
        expectedRevision: number
    ): FudabaCardMutationResult {
        if (!current) return { status: 'unavailable' };
        if (current.revision !== expectedRevision) {
            return { status: 'conflict', revision: current.revision };
        }
        return { status: 'unavailable' };
    }

    private savedCardResult(
        row: FudabaCardRow,
        previousObjectKey: string | null
    ): FudabaCardMutationResult {
        return {
            status: 'saved',
            card: cardRecord(row),
            previousObjectKey
        };
    }

    createCardForOwner(
        input: CreateOwnedFudabaCardInput
    ): Promise<FudabaCardMutationResult> {
        return this.serializeWrite(async () => {
            const result = await this.database.prepare(
                `INSERT INTO fudaba_cards
                    (id, owner_account_id, producer_name, display_name,
                     series_code, favorite_idol, front_object_key, back_object_key,
                     accent, bio, trade_note, available, source_url, source_label,
                     source_credit, media_rights_status, publication_status,
                     revision, created_at, updated_at, deleted_at)
                 SELECT ?, account.id, ?, ?, series.code, ?, ?, ?, ?, ?, ?, ?,
                        NULL, NULL, NULL, 'unknown', 'pending', 0, ?, ?, NULL
                 FROM platform_accounts account
                 JOIN fudaba_series_tags series
                   ON series.code=? AND series.enabled=?
                 WHERE account.id=? AND account.status='active'
                   AND account.deleted_at IS NULL
                 ON CONFLICT(id) DO NOTHING
                 RETURNING ${CARD_COLUMNS}`
            ).bind(
                input.id,
                input.producerName,
                input.displayName,
                input.favoriteIdol,
                input.frontObjectKey,
                input.backObjectKey,
                input.accent,
                input.bio,
                input.tradeNote,
                this.bindBoolean(input.available),
                input.createdAt,
                input.updatedAt,
                input.seriesCode,
                this.bindBoolean(true),
                input.ownerAccountId
            ).run<FudabaCardRow>();
            const saved = result.results[0];
            return saved
                ? this.savedCardResult(saved, null)
                : { status: 'unavailable' };
        });
    }

    updateCardMetadataForOwner(
        input: UpdateOwnedFudabaCardMetadataInput
    ): Promise<FudabaCardMutationResult> {
        return this.serializeWrite(async () => {
            const result = await this.database.prepare(
                `UPDATE fudaba_cards
                 SET producer_name=?, display_name=?, series_code=?, favorite_idol=?,
                     accent=?, bio=?, trade_note=?, available=?,
                     media_rights_status='unknown', publication_status='pending',
                     revision=revision+1, updated_at=?
                 WHERE id=? AND owner_account_id=? AND revision=?
                   AND deleted_at IS NULL
                   AND EXISTS (
                       SELECT 1 FROM platform_accounts account
                       WHERE account.id=fudaba_cards.owner_account_id
                         AND account.status='active' AND account.deleted_at IS NULL
                   )
                   AND EXISTS (
                       SELECT 1 FROM fudaba_series_tags series
                       WHERE series.code=? AND series.enabled=?
                   )
                 RETURNING ${CARD_COLUMNS}`
            ).bind(
                input.producerName,
                input.displayName,
                input.seriesCode,
                input.favoriteIdol,
                input.accent,
                input.bio,
                input.tradeNote,
                this.bindBoolean(input.available),
                input.updatedAt,
                input.cardId,
                input.ownerAccountId,
                input.expectedRevision,
                input.seriesCode,
                this.bindBoolean(true)
            ).run<FudabaCardRow>();
            const saved = result.results[0];
            if (saved) return this.savedCardResult(saved, null);
            return this.cardWriteFailure(
                await this.findActiveCardForOwner(
                    input.cardId,
                    input.ownerAccountId
                ),
                input.expectedRevision
            );
        });
    }

    updateCardMediaForOwner(
        input: UpdateOwnedFudabaCardMediaInput
    ): Promise<FudabaCardMutationResult> {
        return this.serializeWrite(async () => {
            const current = await this.findActiveCardForOwner(
                input.cardId,
                input.ownerAccountId
            );
            if (!current || current.revision !== input.expectedRevision) {
                return this.cardWriteFailure(current, input.expectedRevision);
            }
            const objectKeyColumn = input.side === 'front'
                ? 'front_object_key'
                : 'back_object_key';
            const result = await this.database.prepare(
                `UPDATE fudaba_cards
                 SET ${objectKeyColumn}=?, media_rights_status='unknown',
                     publication_status='pending', revision=revision+1, updated_at=?
                 WHERE id=? AND owner_account_id=? AND revision=?
                   AND deleted_at IS NULL
                   AND EXISTS (
                       SELECT 1 FROM platform_accounts account
                       WHERE account.id=fudaba_cards.owner_account_id
                         AND account.status='active' AND account.deleted_at IS NULL
                   )
                 RETURNING ${CARD_COLUMNS}`
            ).bind(
                input.objectKey,
                input.updatedAt,
                input.cardId,
                input.ownerAccountId,
                input.expectedRevision
            ).run<FudabaCardRow>();
            const saved = result.results[0];
            if (saved) {
                return this.savedCardResult(
                    saved,
                    input.side === 'front'
                        ? current.front_object_key
                        : current.back_object_key
                );
            }
            return this.cardWriteFailure(
                await this.findActiveCardForOwner(
                    input.cardId,
                    input.ownerAccountId
                ),
                input.expectedRevision
            );
        });
    }

    softDeleteCardForOwner(
        input: SoftDeleteOwnedFudabaCardInput
    ): Promise<FudabaCardMutationResult> {
        return this.serializeWrite(async () => {
            const result = await this.database.prepare(
                `UPDATE fudaba_cards
                 SET deleted_at=?, updated_at=?, media_rights_status='unknown',
                     publication_status='pending', revision=revision+1
                 WHERE id=? AND owner_account_id=? AND revision=?
                   AND deleted_at IS NULL
                   AND EXISTS (
                       SELECT 1 FROM platform_accounts account
                       WHERE account.id=fudaba_cards.owner_account_id
                         AND account.status='active' AND account.deleted_at IS NULL
                   )
                 RETURNING ${CARD_COLUMNS}`
            ).bind(
                input.deletedAt,
                input.deletedAt,
                input.cardId,
                input.ownerAccountId,
                input.expectedRevision
            ).run<FudabaCardRow>();
            const saved = result.results[0];
            if (saved) return this.savedCardResult(saved, null);
            return this.cardWriteFailure(
                await this.findActiveCardForOwner(
                    input.cardId,
                    input.ownerAccountId
                ),
                input.expectedRevision
            );
        });
    }

    placeOwnedCard(input: {
        officeId: string;
        cardId: string;
        ownerAccountId: string;
        pinnedAt: string;
        positionX: number;
        positionY: number;
        rotation: number;
        zIndex: number;
    }): Promise<boolean> {
        return this.serializeWrite(async () => {
            const result = await executeSql(
                this.database,
                `INSERT INTO fudaba_office_cards
                    (office_id, card_id, pinned_at, position_x, position_y,
                     rotation, z_index)
                 SELECT office.id, card.id, ?, ?, ?, ?, ?
                 FROM fudaba_offices office
                 JOIN fudaba_cards card ON card.id=?
                 WHERE office.id=? AND office.status<>'archived'
                   AND card.owner_account_id=? AND card.deleted_at IS NULL
                 ON CONFLICT(office_id, card_id) DO NOTHING`,
                [
                    input.pinnedAt,
                    input.positionX,
                    input.positionY,
                    input.rotation,
                    input.zIndex,
                    input.cardId,
                    input.officeId,
                    input.ownerAccountId
                ]
            );
            return result.meta.changes === 1;
        });
    }

    createMessage(input: {
        id: string;
        officeId: string;
        authorAccountId: string;
        content: string;
        createdAt: string;
    }): Promise<boolean> {
        return this.serializeWrite(async () => {
            const result = await executeSql(
                this.database,
                `INSERT INTO fudaba_messages
                    (id, office_id, author_account_id, content, created_at)
                 SELECT ?, office.id, ?, ?, ?
                 FROM fudaba_offices office
                 WHERE office.id=? AND office.status<>'archived'
                 ON CONFLICT(id) DO NOTHING`,
                [
                    input.id,
                    input.authorAccountId,
                    input.content,
                    input.createdAt,
                    input.officeId
                ]
            );
            return result.meta.changes === 1;
        });
    }

    createExchangeRequest(input: {
        id: string;
        officeId: string;
        requesterAccountId: string;
        recipientAccountId: string;
        wantedCardId: string;
        offeredCardId: string | null;
        note: string;
        createdAt: string;
    }): Promise<FudabaExchangeRequestRecord | null> {
        return this.serializeWrite(async () => {
            const row = await queryOne<FudabaExchangeRequestRow>(
                this.database,
                `INSERT INTO fudaba_exchange_requests
                    (id, office_id, requester_account_id, recipient_account_id,
                     wanted_card_id, offered_card_id, note, status, version,
                     created_at, updated_at, resolved_at)
                 SELECT ?, office.id, requester.id, recipient.id, wanted.id,
                        offered.id, ?, 'pending', 0, ?, ?, NULL
                 FROM fudaba_offices office
                 JOIN fudaba_office_cards placement
                   ON placement.office_id=office.id
                 JOIN fudaba_cards wanted
                   ON wanted.id=placement.card_id
                 JOIN platform_accounts requester ON requester.id=?
                 JOIN platform_accounts recipient ON recipient.id=?
                 LEFT JOIN fudaba_cards offered ON offered.id=?
                 WHERE office.id=? AND office.status<>'archived'
                   AND wanted.id=? AND wanted.owner_account_id=recipient.id
                   AND wanted.deleted_at IS NULL
                   AND requester.id<>recipient.id
                   AND (CAST(? AS TEXT) IS NULL OR (
                       offered.owner_account_id=requester.id
                       AND offered.deleted_at IS NULL
                       AND offered.id<>wanted.id
                   ))
                 ON CONFLICT DO NOTHING
                 RETURNING ${EXCHANGE_COLUMNS}`,
                [
                    input.id,
                    input.note,
                    input.createdAt,
                    input.createdAt,
                    input.requesterAccountId,
                    input.recipientAccountId,
                    input.offeredCardId,
                    input.officeId,
                    input.wantedCardId,
                    input.offeredCardId
                ]
            );
            return row ? exchangeRecord(row) : null;
        });
    }

    setCardInteraction(input: {
        kind: 'like' | 'favorite';
        cardId: string;
        accountId: string;
        active: boolean;
        createdAt: string;
    }): Promise<boolean> {
        const table = input.kind === 'like'
            ? 'fudaba_card_likes'
            : 'fudaba_card_favorites';
        return this.serializeWrite(async () => {
            const result = input.active
                ? await executeSql(
                    this.database,
                    `INSERT INTO ${table} (card_id, account_id, created_at)
                     SELECT card.id, account.id, ?
                     FROM fudaba_cards card
                     JOIN platform_accounts account ON account.id=?
                     WHERE card.id=? AND card.deleted_at IS NULL
                     ON CONFLICT(card_id, account_id) DO NOTHING`,
                    [input.createdAt, input.accountId, input.cardId]
                )
                : await executeSql(
                    this.database,
                    `DELETE FROM ${table} WHERE card_id=? AND account_id=?`,
                    [input.cardId, input.accountId]
                );
            return result.meta.changes === 1;
        });
    }

    createModerationCase(
        input: NewFudabaModerationCaseInput
    ): Promise<FudabaModerationCaseRecord> {
        return this.serializeWrite(async () => {
            const row = await queryOne<FudabaModerationCaseRow>(
                this.database,
                `INSERT INTO fudaba_moderation_cases
                    (id, resource_kind, resource_id, reporter_account_id, reason,
                     details, state, backoffice_actor_id, resolution, created_at,
                     updated_at, resolved_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING ${MODERATION_COLUMNS}`,
                [
                    input.id,
                    input.resourceKind,
                    input.resourceId,
                    input.reporterAccountId,
                    input.reason,
                    input.details,
                    input.state,
                    input.backofficeActorId,
                    input.resolution,
                    input.createdAt,
                    input.updatedAt,
                    input.resolvedAt
                ]
            );
            if (!row) throw new Error('Fudaba moderation case was not created');
            return moderationRecord(row);
        });
    }
}
