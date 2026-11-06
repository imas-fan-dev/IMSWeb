/**
 * Shared fixture for the admin namecard catalog suites.
 *
 * Both suites drive the real Hono app against a real PostgreSQL database, so the
 * schema, the SQL, the repositories and the wire contracts are exercised
 * together instead of against hand-written stubs. Only the harness wiring is
 * shared here; every assertion stays in the suite that owns it.
 */
import { assertContractJson } from '../contracts/contract-json';
import { insertUser } from '../fixtures/rows';
import { createPostgresTestDatabase } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';
import type { ImsHonoApp } from '@/app';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { SqlBackofficeAuthRepository } from '@/infra/db/repositories/backoffice-auth-repository';
import { SqlNamecardCharacterRepository } from '@/infra/db/repositories/namecard-character-repository';
import { SqlNamecardUnitRepository } from '@/infra/db/repositories/namecard-unit-repository';
import { queryAll, queryOne } from '@/infra/db/sql/query';
import type { PostgresConnection } from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { HmacBackofficeTokenService } from '@/infra/security/hmac/token-service';
import type { AdminRole } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import {
    namecardCharacterMutationSchema,
    type NamecardCharacter
} from '@imsweb/contracts/fudaba/admin-characters';
import {
    namecardUnitMutationSchema,
    type NamecardUnit
} from '@imsweb/contracts/fudaba/admin-units';
import { adminApiPath } from '@imsweb/contracts/paths';

/** Long enough for the HMAC signer, which refuses short secrets. */
export const NAMECARD_ADMIN_SECRET =
    'namecard-admin-tests-secret-value-32-bytes';

/** The sentinel agency the migrations seed the fallback buckets into. */
export const NAMECARD_OTHER_AGENCY_ID = 999999;

export interface NamecardAdminActor {
    id: number;
    username: string;
    dept: string;
    role: AdminRole | null;
}

export interface NamecardAdminFixture {
    app: ImsHonoApp;
    connection: PostgresConnection;
    audit: SqlAuditRepository;
    tokens: HmacBackofficeTokenService;
    operator: NamecardAdminActor;
    editor: NamecardAdminActor;
    close(): Promise<void>;
}

export async function createNamecardAdminFixture(): Promise<NamecardAdminFixture> {
    const connection = await createPostgresTestDatabase('namecard-admin');
    await new PostgresqlSchemaStrategy().initializeCore(connection);
    const operatorId = await insertUser(connection, 'namecard-operator', {
        password: 'stored-digest',
        dept: 'op',
        producername: 'Namecard Operator',
        admin_role: 'admin'
    });
    const editorId = await insertUser(connection, 'namecard-editor', {
        password: 'stored-digest',
        dept: 'editor',
        producername: 'Namecard Editor',
        admin_role: null
    });
    const tokens = new HmacBackofficeTokenService(NAMECARD_ADMIN_SECRET);
    const audit = new SqlAuditRepository(connection);
    const services: RuntimeServices = {
        backofficeAuth: new SqlBackofficeAuthRepository(connection),
        namecardCharacters: new SqlNamecardCharacterRepository(connection),
        namecardUnits: new SqlNamecardUnitRepository(connection),
        audit,
        backofficeTokens: tokens,
        config: { cookieSecure: false, fudabaPublicReadEnabled: true }
    };
    return {
        app: createTestApp(() => services),
        connection,
        audit,
        tokens,
        operator: {
            id: operatorId,
            username: 'namecard-operator',
            dept: 'op',
            role: 'admin'
        },
        editor: {
            id: editorId,
            username: 'namecard-editor',
            dept: 'editor',
            role: null
        },
        close() {
            return connection.close();
        }
    };
}

/**
 * Cookies only, no `Authorization`: that is the shape a browser sends, so the
 * CSRF guard applies to it. The legacy cookie names are the ones the backoffice
 * still issues.
 */
export async function namecardActorHeaders(
    fixture: NamecardAdminFixture,
    actor: NamecardAdminActor
): Promise<Record<string, string>> {
    const csrf = `csrf-${actor.username}`;
    const token = await fixture.tokens.sign(
        {
            id: actor.id,
            username: actor.username,
            producername: `${actor.username} P`,
            dept: actor.dept,
            adminRole: actor.role,
            csrfSecret: csrf
        },
        3600
    );
    return {
        Cookie: `token=${token}; csrf_token=${csrf}`,
        'X-CSRFToken': csrf
    };
}

/** The same session presented as a bearer token, which skips the CSRF guard. */
export async function namecardActorBearerHeaders(
    fixture: NamecardAdminFixture,
    actor: NamecardAdminActor
): Promise<Record<string, string>> {
    const token = await fixture.tokens.sign(
        {
            id: actor.id,
            username: actor.username,
            producername: `${actor.username} P`,
            dept: actor.dept,
            adminRole: actor.role,
            csrfSecret: `csrf-${actor.username}`
        },
        3600
    );
    return { Authorization: `Bearer ${token}` };
}

export function namecardJsonInit(
    method: string,
    headers: Record<string, string>,
    body?: unknown
): RequestInit {
    return {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    };
}

export interface NamecardAgencySeed {
    code: string;
    nameCn: string;
    displayOrder: number;
    color?: string;
    wikiEnabled?: boolean;
}

/** The API has no agency CRUD, so tests seed agencies directly. */
export async function insertNamecardAgency(
    connection: PostgresConnection,
    seed: NamecardAgencySeed
): Promise<number> {
    const row = await queryOne<{ id: number }>(
        connection,
        `INSERT INTO agencies
            (code, name_cn, color, wiki_enabled, display_order, banner_title)
         VALUES (?, ?, ?, ?, ?, '')
         RETURNING id`,
        [
            seed.code,
            seed.nameCn,
            seed.color ?? '#336699',
            seed.wikiEnabled ?? true,
            seed.displayOrder
        ]
    );
    if (!row) throw new Error('agency insert returned no row');
    return row.id;
}

export interface NamecardCharacterSeed {
    agencyId: number;
    category: string;
    nameCn: string;
    nameJa?: string;
    nameEn?: string;
    aliases?: string;
    displayOrder?: number;
    isFallback?: boolean;
}

/**
 * Creates a character through the API and returns the parsed contract body, so
 * a broken create fails the test that needed the row rather than silently
 * leaving it out.
 */
export async function seedNamecardCharacter(
    fixture: NamecardAdminFixture,
    headers: Record<string, string>,
    seed: NamecardCharacterSeed
): Promise<NamecardCharacter> {
    const response = await testRequest(
        fixture.app,
        adminApiPath('/cards/characters'),
        namecardJsonInit('POST', headers, seed)
    );
    return (
        await assertContractJson(
            response,
            201,
            namecardCharacterMutationSchema
        )
    ).character;
}

export interface NamecardUnitSeed {
    nameCn: string;
    nameJa?: string;
    nameEn?: string;
    aliases?: string;
    displayOrder?: number;
    agencyIds: number[];
    memberIds: number[];
}

export async function seedNamecardUnit(
    fixture: NamecardAdminFixture,
    headers: Record<string, string>,
    seed: NamecardUnitSeed
): Promise<NamecardUnit> {
    const response = await testRequest(
        fixture.app,
        adminApiPath('/cards/units'),
        namecardJsonInit('POST', headers, seed)
    );
    return (await assertContractJson(response, 201, namecardUnitMutationSchema))
        .unit;
}

export interface NamecardAuditRow {
    action: string;
    target: string;
    username: string;
    producername: string;
}

/** The `logs` rows one audited action left behind, oldest first. */
export async function namecardAuditRows(
    connection: PostgresConnection,
    action: string
): Promise<NamecardAuditRow[]> {
    const rows = await queryAll<NamecardAuditRow>(
        connection,
        `SELECT action, target, username, producername
         FROM logs WHERE action=? ORDER BY id`,
        [action]
    );
    return rows;
}
