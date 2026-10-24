import type {
    NamecardCharacterAgencyRecord,
    NamecardCharacterCreateResult,
    NamecardCharacterDeleteResult,
    NamecardCharacterListFilter,
    NamecardCharacterListInput,
    NamecardCharacterRecord,
    NamecardCharacterRepository,
    NamecardCharacterUpdateResult,
    NewNamecardCharacterInput,
    UpdateNamecardCharacterInput
} from '@/ports/repositories/namecard-characters';
import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import { queryAll, queryOne } from '@/infra/db/sql/query';

/**
 * The joined projection every read path returns. `entry` carries the catalog
 * row, `agency` supplies the label; the column order matches
 * `NamecardCharacterRecord` so the row can be cast directly.
 */
const CHARACTER_SELECT = `SELECT entry.id, entry.agency_id, entry.category,
        entry.is_fallback, entry.name_cn, entry.name_ja, entry.name_en,
        entry.aliases, entry.display_order, entry.revision,
        entry.created_at, entry.updated_at,
        agency.code AS agency_code, agency.name_cn AS agency_name,
        agency.color AS agency_color
    FROM namecard_characters entry
    JOIN agencies agency ON agency.id=entry.agency_id`;

/**
 * Catalog order: agency, then category in the order the contract declares,
 * then the operator-set display order, with creation time as the final
 * tiebreak. Keep the `CASE` arms in sync with `NAMECARD_CHARACTER_CATEGORIES`
 * in `@imsweb/contracts/fudaba/admin-characters`.
 */
const CHARACTER_ORDER = `ORDER BY agency.display_order, agency.id,
        CASE entry.category
            WHEN 'idol' THEN 0
            WHEN 'staff' THEN 1
            WHEN 'rival' THEN 2
            WHEN 'mascot' THEN 3
            WHEN 'chara' THEN 4
            ELSE 5
        END,
        entry.display_order, entry.created_at, entry.id`;

/** The name unique index; a violation is a duplicate name, not a server error. */
const AGENCY_NAME_CONSTRAINT = 'namecard_characters_agency_name_key';

/**
 * The partial unique index that allows at most one fallback entry per category;
 * a violation is a request error with a readable message.
 */
const FALLBACK_CATEGORY_CONSTRAINT =
    'namecard_characters_fallback_category_key';

interface FilterFragment {
    clause: string;
    values: unknown[];
}

/**
 * `filter.query` already carries the `%` wildcards and escaped literals, so it
 * is bound once per searched column and matched with `ESCAPE '\'`.
 */
function characterFilter(filter: NamecardCharacterListFilter): FilterFragment {
    const clauses = ['entry.deleted_at IS NULL'];
    const values: unknown[] = [];
    if (filter.query !== null) {
        clauses.push(
            `(entry.name_cn ILIKE ? ESCAPE '\\'
              OR entry.name_ja ILIKE ? ESCAPE '\\'
              OR entry.name_en ILIKE ? ESCAPE '\\'
              OR entry.aliases ILIKE ? ESCAPE '\\')`
        );
        values.push(filter.query, filter.query, filter.query, filter.query);
    }
    if (filter.agencyId !== null) {
        clauses.push('entry.agency_id=?');
        values.push(filter.agencyId);
    }
    if (filter.category !== null) {
        clauses.push('entry.category=?');
        values.push(filter.category);
    }
    return { clause: clauses.join(' AND '), values };
}

function isDuplicateName(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const databaseError = error as Error & { code?: string; constraint?: string };
    return (
        databaseError.code === '23505' &&
        databaseError.constraint === AGENCY_NAME_CONSTRAINT
    );
}

/** `23505` on the partial index means a fallback already owns that category. */
function isDuplicateFallback(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const databaseError = error as Error & { code?: string; constraint?: string };
    return (
        databaseError.code === '23505' &&
        databaseError.constraint === FALLBACK_CATEGORY_CONSTRAINT
    );
}

export class SqlNamecardCharacterRepository implements NamecardCharacterRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    listNamecardCharacters(
        input: NamecardCharacterListInput,
    ): Promise<NamecardCharacterRecord[]> {
        const filter = characterFilter(input);
        return queryAll<NamecardCharacterRecord>(
            this.database,
            `${CHARACTER_SELECT} WHERE ${filter.clause} ${CHARACTER_ORDER} LIMIT ? OFFSET ?`,
            [...filter.values, input.limit, input.offset],
        );
    }

    async countNamecardCharacters(
        filter: NamecardCharacterListFilter,
    ): Promise<number> {
        const fragment = characterFilter(filter);
        const row = await queryOne<{ total: number }>(
            this.database,
            `SELECT COUNT(*) AS total FROM namecard_characters entry
             WHERE ${fragment.clause}`,
            fragment.values,
        );
        return row?.total ?? 0;
    }

    findNamecardCharacterById(
        id: number,
    ): Promise<NamecardCharacterRecord | null> {
        return queryOne<NamecardCharacterRecord>(
            this.database,
            `${CHARACTER_SELECT} WHERE entry.id=? AND entry.deleted_at IS NULL`,
            [id],
        );
    }

    listNamecardCharacterCatalog(): Promise<NamecardCharacterRecord[]> {
        return queryAll<NamecardCharacterRecord>(
            this.database,
            `${CHARACTER_SELECT} WHERE entry.deleted_at IS NULL ${CHARACTER_ORDER}`,
        );
    }

    listNamecardCharacterAgencies(): Promise<NamecardCharacterAgencyRecord[]> {
        return queryAll<NamecardCharacterAgencyRecord>(
            this.database,
            `SELECT id, code, name_cn, color, wiki_enabled
             FROM agencies ORDER BY display_order, id`,
        );
    }

    async createNamecardCharacter(
        input: NewNamecardCharacterInput,
    ): Promise<NamecardCharacterCreateResult> {
        try {
            const created = await queryOne<{ id: number }>(
                this.database,
                `INSERT INTO namecard_characters
                    (agency_id, category, is_fallback, name_cn, name_ja, name_en,
                     aliases, display_order, revision, created_by, updated_by)
                 SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?
                 WHERE EXISTS (SELECT 1 FROM agencies WHERE id=?)
                 RETURNING id`,
                [
                    input.agencyId,
                    input.category,
                    input.isFallback,
                    input.nameCn,
                    input.nameJa,
                    input.nameEn,
                    input.aliases,
                    input.displayOrder,
                    input.actorId,
                    input.actorId,
                    input.agencyId,
                ],
            );
            if (!created) return { status: 'agency-not-found' };
            const character = await this.findNamecardCharacterById(created.id);
            if (!character) {
                throw new Error('Namecard character insert could not be read back');
            }
            return { status: 'created', character };
        } catch (error) {
            if (isDuplicateName(error)) return { status: 'duplicate' };
            if (isDuplicateFallback(error)) return { status: 'fallback-exists' };
            throw error;
        }
    }

    updateNamecardCharacter(
        input: UpdateNamecardCharacterInput,
    ): Promise<NamecardCharacterUpdateResult> {
        return this.database.transaction(async (database) => {
            try {
                const updated = await queryOne<{ id: number }>(
                    database,
                    `UPDATE namecard_characters
                     SET agency_id=?, category=?, name_cn=?, name_ja=?,
                         name_en=?, aliases=?, display_order=?,
                         is_fallback=COALESCE(?, is_fallback),
                         revision=revision+1, updated_by=?,
                         updated_at=CURRENT_TIMESTAMP
                     WHERE id=? AND revision=? AND deleted_at IS NULL
                       AND EXISTS (SELECT 1 FROM agencies WHERE id=?)
                     RETURNING id`,
                    [
                        input.agencyId,
                        input.category,
                        input.nameCn,
                        input.nameJa,
                        input.nameEn,
                        input.aliases,
                        input.displayOrder,
                        input.isFallback,
                        input.actorId,
                        input.id,
                        input.revision,
                        input.agencyId,
                    ],
                );
                if (!updated) {
                    return this.explainMiss(database, input);
                }
                const character = await queryOne<NamecardCharacterRecord>(
                    database,
                    `${CHARACTER_SELECT} WHERE entry.id=?`,
                    [updated.id],
                );
                if (!character) {
                    throw new Error(
                        'Namecard character update could not be read back',
                    );
                }
                return { status: 'updated', character };
            } catch (error) {
                if (isDuplicateName(error)) return { status: 'duplicate' };
                if (isDuplicateFallback(error)) {
                    return { status: 'fallback-exists' };
                }
                throw error;
            }
        });
    }

    deleteNamecardCharacter(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardCharacterDeleteResult> {
        return this.database.transaction(async (database) => {
            const deleted = await queryOne<{ id: number }>(
                database,
                `UPDATE namecard_characters
                 SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP,
                     revision=revision+1
                 WHERE id=? AND revision=? AND deleted_at IS NULL
                 RETURNING id`,
                [id, expectedRevision],
            );
            if (deleted) return { status: 'deleted', id: deleted.id };
            const current = await queryOne<{ revision: number }>(
                database,
                'SELECT revision FROM namecard_characters WHERE id=? AND deleted_at IS NULL',
                [id],
            );
            return current
                ? { status: 'conflict', revision: current.revision }
                : { status: 'not-found' };
        });
    }

    /**
     * A guarded update that changed no row is either "the agency does not exist"
     * or "the row is gone or its revision moved on". The agency check comes first
     * because assigning to a missing agency is a request error, not a conflict.
     */
    private async explainMiss(
        database: SqlDatabase,
        input: UpdateNamecardCharacterInput,
    ): Promise<NamecardCharacterUpdateResult> {
        const agency = await queryOne<{ id: number }>(
            database,
            'SELECT id FROM agencies WHERE id=?',
            [input.agencyId],
        );
        if (!agency) return { status: 'agency-not-found' };
        const current = await queryOne<{ revision: number }>(
            database,
            'SELECT revision FROM namecard_characters WHERE id=? AND deleted_at IS NULL',
            [input.id],
        );
        return current
            ? { status: 'conflict', revision: current.revision }
            : { status: 'not-found' };
    }
}
