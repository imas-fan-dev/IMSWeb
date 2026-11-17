/**
 * Shared domain row builders for API server tests.
 *
 * Each builder owns the SQL skeleton and the neutral defaults for one table
 * that several test files seed. Callers pass only the columns their scenario
 * reads, so a test states the state it depends on instead of restating the
 * schema. `runInsert` stays private: a generic public `insertRows` helper would
 * only rename `prepare().bind().run()` and move the SQL away from its caller.
 *
 * Required columns are positional. A column is required only when no neutral
 * default can satisfy the table's constraints (identity, uniqueness, or a
 * scenario-owned timestamp).
 *
 * Only tables whose insert *shape* repeats get a builder. `fudaba_cards` and
 * `cards` are deliberately absent. Both recur across several files, but each
 * file writes a different column set for a different row kind: the namecard
 * migration seeds a 21-column ownerless legacy row, the contract seed writes a
 * 12-column subset carrying a `card_number`, and the claim-review fixture
 * mirrors the post-backfill shape alongside a paired `cards` row and a
 * `cards_id_seq` advance. In the `cards` case three of four call sites are
 * literal rows with no bound parameters, and those literals are the
 * migration's input under test. A builder for any of them would have to accept
 * nearly every column and would move the shape being asserted on out of the
 * test that asserts it. Table recurrence is necessary but not sufficient; the
 * column set has to recur too.
 */
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import type {
    BackofficeAccountRecord,
    FudabaLocationReviewState,
    PlatformAccountRecord,
    PlatformAccountStatus,
} from '@/ports/repositories';

// Timestamps already used as neutral seeds by the repository tests.
const DEFAULT_ACCOUNT_TIMESTAMP = 1_700_000_000_000;

export type PlatformAccountRow = PlatformAccountRecord;

export type BackofficeAccountRow = Omit<BackofficeAccountRecord, 'id'>;

/** The `users` compatibility view exposes the same columns as its base table. */
export type UserRow = BackofficeAccountRow;

export interface FudabaOfficePublicLocationRow {
    office_id: string;
    latitude_e1: number;
    longitude_e1: number;
    review_state: FudabaLocationReviewState;
    revision: number;
    submitted_at: string;
    reviewed_at: string | null;
    reviewed_by: number | null;
    review_audit_id: string | null;
    review_note: string;
}

async function runInsert<Row = Record<string, unknown>>(
    database: ManagedSqlDatabase,
    sql: string,
    values: unknown[],
): Promise<Row | null> {
    return database.prepare(sql).bind(...values).first<Row>();
}

async function requireInsertedId(
    database: ManagedSqlDatabase,
    sql: string,
    values: unknown[],
): Promise<number> {
    const row = await runInsert<{ id: number }>(database, sql, values);
    if (!row) throw new Error('test row insert did not return an id');
    return Number(row.id);
}

export async function insertPlatformAccount(
    database: ManagedSqlDatabase,
    id: string,
    overrides: Partial<Omit<PlatformAccountRow, 'id'>> = {},
): Promise<void> {
    const created_at = overrides.created_at ?? DEFAULT_ACCOUNT_TIMESTAMP;
    const status: PlatformAccountStatus = overrides.status ?? 'active';
    await runInsert(
        database,
        `INSERT INTO platform_accounts
            (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            id,
            status,
            overrides.token_version ?? 0,
            created_at,
            overrides.updated_at ?? created_at,
            // The table enforces (status = 'deleted') = (deleted_at IS NOT NULL).
            overrides.deleted_at ?? (status === 'deleted' ? created_at : null),
        ],
    );
}

export async function insertBackofficeAccount(
    database: ManagedSqlDatabase,
    username: string,
    overrides: Partial<Omit<BackofficeAccountRow, 'username'>> = {},
): Promise<number> {
    return requireInsertedId(
        database,
        `INSERT INTO backoffice_accounts
            (username, password, dept, producername, admin_role)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
        [
            username,
            overrides.password ?? 'hash',
            overrides.dept ?? 'op',
            overrides.producername ?? null,
            // `null` is a valid role for non-op accounts, so only an omitted
            // property falls back to the operator default.
            overrides.admin_role === undefined ? 'admin' : overrides.admin_role,
        ],
    );
}

export async function insertUser(
    database: ManagedSqlDatabase,
    username: string,
    overrides: Partial<Omit<UserRow, 'username'>> = {},
): Promise<number> {
    return requireInsertedId(
        database,
        `INSERT INTO users
            (username, password, dept, producername, admin_role)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
        [
            username,
            overrides.password ?? 'hash',
            overrides.dept ?? 'op',
            overrides.producername ?? null,
            overrides.admin_role === undefined ? 'admin' : overrides.admin_role,
        ],
    );
}

export async function insertFudabaOfficePublicLocation(
    database: ManagedSqlDatabase,
    officeId: string,
    submittedAt: string,
    overrides: Partial<
        Omit<FudabaOfficePublicLocationRow, 'office_id' | 'submitted_at'>
    > = {},
): Promise<void> {
    await runInsert(
        database,
        `INSERT INTO fudaba_office_public_locations
            (office_id, latitude_e1, longitude_e1, review_state, revision,
             submitted_at, reviewed_at, reviewed_by, review_note, review_audit_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            officeId,
            overrides.latitude_e1 ?? 312,
            overrides.longitude_e1 ?? 1215,
            overrides.review_state ?? 'pending',
            overrides.revision ?? 0,
            submittedAt,
            overrides.reviewed_at ?? null,
            overrides.reviewed_by ?? null,
            overrides.review_note ?? '',
            overrides.review_audit_id ?? null,
        ],
    );
}
