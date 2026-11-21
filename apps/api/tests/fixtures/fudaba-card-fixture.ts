/**
 * Shared fixtures for the merged Fudaba card/office server suite.
 *
 * `server/fudaba.test.ts` keeps one scope block per historical file, so the same
 * card/office/account builders used to be redeclared inside every block. They
 * live here now; each block keeps a thin local wrapper that spells out the
 * values only that block used (timestamps, intro/address text, extra receipt
 * columns) instead of silently sharing one set of constants.
 *
 * The builders' defaults are the neutral baseline those blocks override — do not
 * rely on them without checking the block's own constants.
 */
import { onTestFinished } from 'vitest';
import {
    PLATFORM_ACCESS_TOKEN_COOKIE,
    PLATFORM_CSRF_TOKEN_COOKIE
} from '@/domains/identity/platform-auth/contracts/session';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import type {
    FudabaPublicCardRecord,
    NewFudabaCardInput,
    NewFudabaOfficeInput,
    PlatformAccountStatus
} from '@/ports/repositories';
import { bearerTokenHeaders, cookieCsrfHeaders } from './auth-request';
import { cardPageRow, cardPageWrite } from './owner-route-fixture';
import { insertPlatformAccount } from './rows';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { createPostgresTestHarness } from '../integration/postgres-harness';

/**
 * 中立基线时间戳：两个公开名片投影块原本都用这个值，所以直接共用；
 * card/office 的调用块各自用自己的常量在 override 里覆盖。
 */
const BASELINE_CREATED_AT = '2026-08-02T00:00:00.000Z';

/**
 * 不真正建表：repository 测试只关心 SQL 行为，schema 初始化交给迁移。
 */
export const initializedPostgresSchema: SqlSchemaStrategy = {
    initializeCore: async () => undefined,
    initializePlatform: async () => undefined,
    initializeFudaba: async () => undefined,
    initializeStory: async () => undefined
};

export interface FudabaDatabaseFixture {
    database: ManagedSqlDatabase;
}

export interface FudabaRepositoryFixture extends FudabaDatabaseFixture {
    repository: SqlFudabaRepository;
    dialect: 'postgresql';
}

export async function createFudabaRepositoryFixture(
    dialect: 'postgresql' = 'postgresql'
): Promise<FudabaRepositoryFixture> {
    const harness = await createPostgresTestHarness();
    const repository = new SqlFudabaRepository(
        harness.connection,
        initializedPostgresSchema
    );
    onTestFinished(() => harness.close());
    await repository.initialize();
    await seedCanonicalFudabaAgencies(harness.connection);
    return { database: harness.connection, repository, dialect };
}

export async function seedPlatformAccount(
    fixture: FudabaDatabaseFixture,
    id: string,
    status: PlatformAccountStatus = 'active'
): Promise<void> {
    await insertPlatformAccount(fixture.database, id, { status });
}

export function makeFudabaCardInput(
    id: string,
    ownerAccountId: string,
    overrides: Partial<NewFudabaCardInput> = {}
): NewFudabaCardInput {
    return {
        id,
        ownerAccountId,
        producerName: `Producer ${ownerAccountId}`,
        seriesCodes: ['765'],
        favoriteCharacterIds: [900_001],
        pages: [cardPageWrite('front'), cardPageWrite('back')],
        bio: '',
        tradeNote: '',
        exchangeMode: 'manual',
        madeOn: null,
        groupName: null,
        producerReading: null,
        isOriginal: false,
        madeWithAi: false,
        visible: true,
        publicationStatus: 'published',
        revision: 0,
        createdAt: BASELINE_CREATED_AT,
        updatedAt: BASELINE_CREATED_AT,
        deletedAt: null,
        ...overrides
    };
}

export function makeFudabaOfficeInput(
    id: string,
    ownerAccountId: string,
    overrides: Partial<NewFudabaOfficeInput> = {}
): NewFudabaOfficeInput {
    return {
        id,
        ownerAccountId,
        slug: id,
        name: `Office ${id}`,
        intro: '',
        city: 'Shanghai',
        address: 'Private address',
        latitude: 31.2304,
        longitude: 121.4737,
        accent: '#ef5b6c',
        coverObjectKey: null,
        isOpen: true,
        visitorCount: 0,
        status: 'active',
        revision: 0,
        createdAt: BASELINE_CREATED_AT,
        updatedAt: BASELINE_CREATED_AT,
        archivedAt: null,
        seriesCodes: ['765'],
        ...overrides
    };
}

/**
 * 公开名片投影。两个调用块默认 id 不同（`interaction-card` / `card-a`），
 * 所以 id 是必填参数而不是内建默认值。
 */
export function makeFudabaPublicCardRecord(
    id: string,
    overrides: Partial<FudabaPublicCardRecord> = {}
): FudabaPublicCardRecord {
    return {
        id,
        producer_name: 'Producer A',
        series_codes: ['765'],
        favorite_characters: [],
        pages: [cardPageRow('front', 1), cardPageRow('back', 2)],
        middle_object_keys: [],
        accent: '#4f64dd',
        bio: 'Public bio',
        trade_note: 'Trade note',
        exchange_mode: 'manual',
        made_on: null,
        group_name: null,
        producer_reading: null,
        is_original: false,
        made_with_ai: false,
        visible: true,
        credits: [],
        created_at: BASELINE_CREATED_AT,
        like_count: 2,
        viewer_liked: false,
        ...overrides
    };
}

/**
 * 平台 access token Bearer 头。`extra` 可省略，所以「无参」和「附带
 * content-type / idempotency-key」两种调用形态语义都保留。
 */
export function fudabaBearerHeaders(
    token: string,
    extra: Record<string, string> = {}
): Record<string, string> {
    return bearerTokenHeaders(token, extra);
}

/**
 * 平台 access/CSRF cookie 头；`includeCsrfHeader=false` 时故意不带
 * `x-csrftoken`，用于 CSRF 拒绝路径。
 */
export function fudabaCookieHeaders(
    token: string,
    csrf: string,
    includeCsrfHeader: boolean
): Record<string, string> {
    return cookieCsrfHeaders([
        [PLATFORM_ACCESS_TOKEN_COOKIE, token],
        [PLATFORM_CSRF_TOKEN_COOKIE, csrf]
    ], includeCsrfHeader ? csrf : null);
}
