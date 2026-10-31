import type {
    NamecardUnitAgencyRecord,
    NamecardUnitCreateResult,
    NamecardUnitDeleteResult,
    NamecardUnitListFilter,
    NamecardUnitListInput,
    NamecardUnitMemberRecord,
    NamecardUnitRecord,
    NamecardUnitRepository,
    NamecardUnitUpdateResult,
    NewNamecardUnitInput,
    UpdateNamecardUnitInput
} from '@/ports/repositories/namecard-units';
import type {
    ManagedSqlDatabase,
    SqlDatabase,
    SqlStatement
} from '@/infra/db/sql/database';
import { queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';

/**
 * The unit row without its link tables; the aggregate is assembled by
 * `attachUnitRelations`, so `NamecardUnitRecord` is exactly this plus the two
 * ordered lists.
 */
type NamecardUnitRow = Omit<NamecardUnitRecord, 'agencies' | 'members'>;

interface NamecardUnitAgencyLinkRow extends NamecardUnitAgencyRecord {
    unit_id: number;
}

interface NamecardUnitMemberLinkRow extends NamecardUnitMemberRecord {
    unit_id: number;
}

/** The two outcomes of a guarded write whose `WHERE` matched no live row. */
type GuardMiss =
    | { status: 'conflict'; revision: number }
    | { status: 'not-found' };

const UNIT_SELECT = `SELECT unit.id, unit.name_cn, unit.name_ja, unit.name_en,
        unit.aliases, unit.display_order, unit.revision,
        unit.created_at, unit.updated_at
    FROM namecard_units unit`;

const UNIT_ORDER = 'ORDER BY unit.display_order, unit.id';

/** The live-name unique index; a violation is a duplicate name, not a 500. */
const UNIT_NAME_CONSTRAINT = 'namecard_units_name_cn_key';

interface FilterFragment {
    clause: string;
    values: unknown[];
}

/**
 * `filter.query` already carries the `%` wildcards and escaped literals, so it
 * is bound once per searched column and matched with `ESCAPE '\'`. The agency
 * filter is a membership test: a unit filed under several agencies matches any
 * of them.
 */
function unitFilter(filter: NamecardUnitListFilter): FilterFragment {
    const clauses = ['unit.deleted_at IS NULL'];
    const values: unknown[] = [];
    if (filter.query !== null) {
        clauses.push(
            `(unit.name_cn ILIKE ? ESCAPE '\\'
              OR unit.name_ja ILIKE ? ESCAPE '\\'
              OR unit.name_en ILIKE ? ESCAPE '\\'
              OR unit.aliases ILIKE ? ESCAPE '\\')`
        );
        values.push(filter.query, filter.query, filter.query, filter.query);
    }
    // Every selected character has to be on the unit, so each id narrows the set.
    for (const memberId of filter.memberIds) {
        clauses.push(
            `EXISTS (SELECT 1 FROM namecard_unit_members member
                      JOIN namecard_characters member_character
                        ON member_character.id=member.character_id
                     WHERE member.unit_id=unit.id
                       AND member_character.deleted_at IS NULL
                       AND member_character.id=?)`
        );
        values.push(memberId);
    }
    if (filter.agencyId !== null) {
        clauses.push(
            `EXISTS (SELECT 1 FROM namecard_unit_agencies link
                     WHERE link.unit_id=unit.id AND link.agency_id=?)`
        );
        values.push(filter.agencyId);
    }
    return { clause: clauses.join(' AND '), values };
}

function isDuplicateName(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const databaseError = error as Error & { code?: string; constraint?: string };
    return (
        databaseError.code === '23505' &&
        databaseError.constraint === UNIT_NAME_CONSTRAINT
    );
}

/**
 * Ids from `ids` that have no live row in the referenced table. Called inside
 * the write transaction so the check and the insert see the same snapshot, and
 * so a missing reference is a readable 400 instead of a foreign-key 500. A
 * soft-deleted character counts as missing: a unit must not expand into a
 * character the catalog no longer offers.
 */
async function missingReferenceIds(
    database: SqlDatabase,
    kind: 'agency' | 'character',
    ids: number[]
): Promise<number[]> {
    if (!ids.length) return [];
    const list = new Array(ids.length).fill('?').join(', ');
    const rows = await queryAll<{ id: number }>(
        database,
        kind === 'agency'
            ? `SELECT id FROM agencies WHERE id IN (${list})`
            : `SELECT id FROM namecard_characters
               WHERE deleted_at IS NULL AND id IN (${list})`,
        ids
    );
    const found = new Set(rows.map((row) => row.id));
    return ids.filter((id) => !found.has(id));
}

/**
 * One `IN` query per link table for the whole page, then grouped in memory.
 * Reading each unit's agencies and members separately would be the N+1 the
 * admin list cannot afford.
 */
async function attachUnitRelations(
    database: SqlDatabase,
    rows: NamecardUnitRow[]
): Promise<NamecardUnitRecord[]> {
    if (!rows.length) return [];
    const unitIds = rows.map((row) => row.id);
    const list = new Array(unitIds.length).fill('?').join(', ');
    const [agencies, members] = await Promise.all([
        queryAll<NamecardUnitAgencyLinkRow>(
            database,
            `SELECT link.unit_id, agency.id, agency.code, agency.name_cn,
                    agency.color
             FROM namecard_unit_agencies link
             JOIN agencies agency ON agency.id=link.agency_id
             WHERE link.unit_id IN (${list})
             ORDER BY link.unit_id, link.display_order`,
            unitIds
        ),
        queryAll<NamecardUnitMemberLinkRow>(
            database,
            `SELECT link.unit_id, character.id AS character_id,
                    character.name_cn, character.name_ja, character.name_en,
                    character.category
             FROM namecard_unit_members link
             JOIN namecard_characters character
               ON character.id=link.character_id
              AND character.deleted_at IS NULL
             WHERE link.unit_id IN (${list})
             ORDER BY link.unit_id, link.display_order`,
            unitIds
        )
    ]);
    const agencyMap = new Map<number, NamecardUnitAgencyRecord[]>();
    for (const agency of agencies) {
        const bucket = agencyMap.get(agency.unit_id);
        const record: NamecardUnitAgencyRecord = {
            id: agency.id,
            code: agency.code,
            name_cn: agency.name_cn,
            color: agency.color
        };
        if (bucket) bucket.push(record);
        else agencyMap.set(agency.unit_id, [record]);
    }
    const memberMap = new Map<number, NamecardUnitMemberRecord[]>();
    for (const member of members) {
        const bucket = memberMap.get(member.unit_id);
        const record: NamecardUnitMemberRecord = {
            character_id: member.character_id,
            name_cn: member.name_cn,
            name_ja: member.name_ja,
            name_en: member.name_en,
            category: member.category
        };
        if (bucket) bucket.push(record);
        else memberMap.set(member.unit_id, [record]);
    }
    return rows.map((row) => ({
        ...row,
        agencies: agencyMap.get(row.id) ?? [],
        members: memberMap.get(row.id) ?? []
    }));
}

export class SqlNamecardUnitRepository implements NamecardUnitRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async listNamecardUnits(
        input: NamecardUnitListInput
    ): Promise<NamecardUnitRecord[]> {
        const filter = unitFilter(input);
        const rows = await queryAll<NamecardUnitRow>(
            this.database,
            `${UNIT_SELECT} WHERE ${filter.clause} ${UNIT_ORDER} LIMIT ? OFFSET ?`,
            [...filter.values, input.limit, input.offset]
        );
        return attachUnitRelations(this.database, rows);
    }

    async countNamecardUnits(filter: NamecardUnitListFilter): Promise<number> {
        const fragment = unitFilter(filter);
        const row = await queryOne<{ total: number }>(
            this.database,
            `SELECT COUNT(*) AS total FROM namecard_units unit
             WHERE ${fragment.clause}`,
            fragment.values
        );
        return row?.total ?? 0;
    }

    async listNamecardUnitCatalog(): Promise<NamecardUnitRecord[]> {
        const rows = await queryAll<NamecardUnitRow>(
            this.database,
            `${UNIT_SELECT} WHERE unit.deleted_at IS NULL ${UNIT_ORDER}`
        );
        return attachUnitRelations(this.database, rows);
    }

    /**
     * The duplicate-name failure is translated outside the transaction: the
     * failed statement aborts the transaction, so the rollback has to happen
     * before the error can be reported as a duplicate.
     */
    async createNamecardUnit(
        input: NewNamecardUnitInput
    ): Promise<NamecardUnitCreateResult> {
        try {
            return await this.database.transaction<NamecardUnitCreateResult>(
                async (database) => {
                    const missingAgencies = await missingReferenceIds(
                        database,
                        'agency',
                        input.agencyIds
                    );
                    if (missingAgencies.length) {
                        return {
                            status: 'agency-not-found',
                            missingIds: missingAgencies
                        };
                    }
                    const missingMembers = await missingReferenceIds(
                        database,
                        'character',
                        input.memberIds
                    );
                    if (missingMembers.length) {
                        return {
                            status: 'member-not-found',
                            missingIds: missingMembers
                        };
                    }
                    const created = await queryOne<{ id: number }>(
                        database,
                        `INSERT INTO namecard_units
                            (name_cn, name_ja, name_en, aliases, display_order,
                             revision, created_by, updated_by)
                         VALUES (?, ?, ?, ?, ?, 0, ?, ?)
                         RETURNING id`,
                        [
                            input.nameCn,
                            input.nameJa,
                            input.nameEn,
                            input.aliases,
                            input.displayOrder,
                            input.actorId,
                            input.actorId
                        ]
                    );
                    if (!created) {
                        throw new Error(
                            'Namecard unit insert could not be read back'
                        );
                    }
                    await writeUnitLinks(
                        database,
                        created.id,
                        input.agencyIds,
                        input.memberIds,
                        false
                    );
                    const unit = await readUnit(database, created.id);
                    if (!unit) {
                        throw new Error(
                            'Namecard unit insert could not be read back'
                        );
                    }
                    return { status: 'created', unit };
                }
            );
        } catch (error) {
            if (isDuplicateName(error)) return { status: 'duplicate' };
            throw error;
        }
    }

    /**
     * Agencies and members travel with the unit as a whole set, so an update
     * replaces both link tables rather than diffing them.
     */
    async updateNamecardUnit(
        input: UpdateNamecardUnitInput
    ): Promise<NamecardUnitUpdateResult> {
        try {
            return await this.database.transaction<NamecardUnitUpdateResult>(
                async (database) => {
                    const missingAgencies = await missingReferenceIds(
                        database,
                        'agency',
                        input.agencyIds
                    );
                    if (missingAgencies.length) {
                        return {
                            status: 'agency-not-found',
                            missingIds: missingAgencies
                        };
                    }
                    const missingMembers = await missingReferenceIds(
                        database,
                        'character',
                        input.memberIds
                    );
                    if (missingMembers.length) {
                        return {
                            status: 'member-not-found',
                            missingIds: missingMembers
                        };
                    }
                    const updated = await queryOne<{ id: number }>(
                        database,
                        `UPDATE namecard_units
                         SET name_cn=?, name_ja=?, name_en=?, aliases=?,
                             display_order=?, revision=revision+1, updated_by=?,
                             updated_at=CURRENT_TIMESTAMP
                         WHERE id=? AND revision=? AND deleted_at IS NULL
                         RETURNING id`,
                        [
                            input.nameCn,
                            input.nameJa,
                            input.nameEn,
                            input.aliases,
                            input.displayOrder,
                            input.actorId,
                            input.id,
                            input.revision
                        ]
                    );
                    if (!updated) return explainMiss(database, input.id);
                    await writeUnitLinks(
                        database,
                        updated.id,
                        input.agencyIds,
                        input.memberIds,
                        true
                    );
                    const unit = await readUnit(database, updated.id);
                    if (!unit) {
                        throw new Error(
                            'Namecard unit update could not be read back'
                        );
                    }
                    return { status: 'updated', unit };
                }
            );
        } catch (error) {
            if (isDuplicateName(error)) return { status: 'duplicate' };
            throw error;
        }
    }

    deleteNamecardUnit(
        id: number,
        expectedRevision: number
    ): Promise<NamecardUnitDeleteResult> {
        return this.database.transaction<NamecardUnitDeleteResult>(
            async (database) => {
                const deleted = await queryOne<{ id: number }>(
                    database,
                    `UPDATE namecard_units
                     SET deleted_at=CURRENT_TIMESTAMP,
                         updated_at=CURRENT_TIMESTAMP,
                         revision=revision+1
                     WHERE id=? AND revision=? AND deleted_at IS NULL
                     RETURNING id`,
                    [id, expectedRevision]
                );
                if (deleted) return { status: 'deleted', id: deleted.id };
                return explainMiss(database, id);
            }
        );
    }
}

/** The unit aggregate for one row, read after a write inside its transaction. */
async function readUnit(
    database: SqlDatabase,
    id: number
): Promise<NamecardUnitRecord | null> {
    const rows = await queryAll<NamecardUnitRow>(
        database,
        `${UNIT_SELECT} WHERE unit.id=? AND unit.deleted_at IS NULL`,
        [id]
    );
    const [unit] = await attachUnitRelations(database, rows);
    return unit ?? null;
}

/**
 * The link rows, in array order. `replace` clears the previous set first, and
 * the deletes run ahead of the inserts in the same batch so the
 * `(unit_id, display_order)` unique index never sees both sets at once.
 */
async function writeUnitLinks(
    database: SqlDatabase,
    unitId: number,
    agencyIds: number[],
    memberIds: number[],
    replace: boolean
): Promise<void> {
    const statements: SqlStatement[] = [];
    if (replace) {
        statements.push(
            sqlStatement(
                database,
                'DELETE FROM namecard_unit_agencies WHERE unit_id=?',
                [unitId]
            ),
            sqlStatement(
                database,
                'DELETE FROM namecard_unit_members WHERE unit_id=?',
                [unitId]
            )
        );
    }
    for (const [index, agencyId] of agencyIds.entries()) {
        statements.push(
            sqlStatement(
                database,
                `INSERT INTO namecard_unit_agencies
                    (unit_id, agency_id, display_order) VALUES (?, ?, ?)`,
                [unitId, agencyId, index]
            )
        );
    }
    for (const [index, characterId] of memberIds.entries()) {
        statements.push(
            sqlStatement(
                database,
                `INSERT INTO namecard_unit_members
                    (unit_id, character_id, display_order) VALUES (?, ?, ?)`,
                [unitId, characterId, index]
            )
        );
    }
    await database.batch(statements);
}

/**
 * A guarded update or delete that changed no row is either "the row is gone" or
 * "its revision moved on"; missing references were already answered as request
 * errors before the guard ran.
 */
async function explainMiss(database: SqlDatabase, id: number): Promise<GuardMiss> {
    const current = await queryOne<{ revision: number }>(
        database,
        'SELECT revision FROM namecard_units WHERE id=? AND deleted_at IS NULL',
        [id]
    );
    return current
        ? { status: 'conflict', revision: current.revision }
        : { status: 'not-found' };
}
