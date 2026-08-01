import type {
    FudabaCardRecord,
    FudabaExchangeRequestRecord,
    FudabaModerationCaseRecord,
    FudabaOfficeRecord,
    FudabaRepository,
    NewFudabaCardInput,
    NewFudabaModerationCaseInput,
    NewFudabaOfficeInput
} from '@/ports/repositories';
import type {
    ManagedSqlDatabase,
    SqlSchemaStrategy
} from '@/infra/db/sql/database';
import {
    executeSql,
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
