import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import type {
    ManagedSqlDatabase,
    SqlSchemaStrategy
} from '@/infra/db/sql/database';
import { SqliteConnection } from '@/infra/db/sqlite/connection';
import {
    SQLITE_FUDABA_SCHEMA,
    SQLITE_FUDABA_WORKFLOW_SCHEMA
} from '@/infra/db/sqlite/fudaba-schema';
import { SqliteSchemaStrategy } from '@/infra/db/sqlite/schema-strategy';
import type {
    NewFudabaCardInput,
    NewFudabaOfficeInput
} from '@/ports/repositories';
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled
} from '../integration/postgres-harness';

const CREATED_AT = '2026-08-02T00:00:00.000Z';
const UPDATED_AT = '2026-08-02T00:01:00.000Z';
const RESOLVED_AT = '2026-08-02T00:02:00.000Z';

const initializedPostgresSchema: SqlSchemaStrategy = {
    initializeCore: async () => undefined,
    initializePlatform: async () => undefined,
    initializeFudaba: async () => undefined,
    initializeStory: async () => undefined
};

interface Fixture {
    database: ManagedSqlDatabase;
    repository: SqlFudabaRepository;
    dialect: 'sqlite' | 'postgresql';
}

function office(
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
        address: '765 Producer Street',
        latitude: 31.2304,
        longitude: 121.4737,
        accent: '#ef5b6c',
        coverObjectKey: null,
        isOpen: true,
        visitorCount: 0,
        status: 'active',
        revision: 0,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        archivedAt: null,
        seriesCodes: ['765as'],
        ...overrides
    };
}

function card(
    id: string,
    ownerAccountId: string,
    overrides: Partial<NewFudabaCardInput> = {}
): NewFudabaCardInput {
    return {
        id,
        ownerAccountId,
        producerName: `Producer ${ownerAccountId}`,
        displayName: `Card ${id}`,
        seriesCode: '765as',
        favoriteIdol: '',
        frontObjectKey: `community/fudaba/cards/${id}/front.webp`,
        backObjectKey: `community/fudaba/cards/${id}/back.webp`,
        accent: '#4f64dd',
        bio: '',
        tradeNote: '',
        available: true,
        sourceUrl: null,
        sourceLabel: null,
        sourceCredit: null,
        mediaRightsStatus: 'approved',
        publicationStatus: 'published',
        revision: 0,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        deletedAt: null,
        ...overrides
    };
}

async function createFixture(
    t: TestContext,
    dialect: 'sqlite' | 'postgresql' = 'sqlite'
): Promise<Fixture> {
    if (dialect === 'postgresql') {
        const harness = await createPostgresTestHarness();
        const repository = new SqlFudabaRepository(
            harness.connection,
            initializedPostgresSchema
        );
        t.after(() => harness.close());
        await repository.initialize();
        return { database: harness.connection, repository, dialect };
    }

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-fudaba-domain-'));
    const database = new SqliteConnection(path.join(root, 'fudaba.sqlite'));
    const schema = new SqliteSchemaStrategy();
    await schema.initializeCore(database);
    await schema.initializePlatform(database);
    const repository = new SqlFudabaRepository(database, schema);
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    return { database, repository, dialect };
}

async function seedPlatformAccount(
    fixture: Fixture,
    accountId: string
): Promise<void> {
    await fixture.database.prepare(
        `INSERT INTO platform_accounts
            (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, 'active', 0, ?, ?, NULL)`
    ).bind(accountId, 1_700_000_000_000, 1_700_000_000_000).run();
}

async function seedBackofficeActor(
    fixture: Fixture,
    username: string
): Promise<number> {
    const table = fixture.dialect === 'sqlite' ? 'users' : 'backoffice_accounts';
    const actor = await fixture.database.prepare(
        `INSERT INTO ${table}
            (username, password, dept, producername, admin_role)
         VALUES (?, 'hash', 'op', ?, 'admin')
         RETURNING id`
    ).bind(username, username).first<{ id: number }>();
    assert.ok(actor);
    return actor.id;
}

async function placeCard(
    fixture: Fixture,
    officeId: string,
    cardId: string,
    ownerAccountId: string,
    zIndex = 1
): Promise<boolean> {
    return fixture.repository.placeOwnedCard({
        officeId,
        cardId,
        ownerAccountId,
        pinnedAt: CREATED_AT,
        positionX: 50,
        positionY: 50,
        rotation: 0,
        zIndex
    });
}

test('runtime SQLite schema stays aligned with the forward migrations', async () => {
    const domainMigration = await fs.readFile(
        path.join(__dirname, '../../migrations/core/0013_fudaba_domain.sql'),
        'utf8'
    );
    const workflowMigration = await fs.readFile(
        path.join(__dirname, '../../migrations/core/0015_fudaba_office_workflows.sql'),
        'utf8'
    );
    for (const table of [
        'fudaba_offices',
        'fudaba_cards',
        'fudaba_office_cards',
        'fudaba_messages',
        'fudaba_exchange_requests'
    ]) {
        assert.ok(domainMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
        assert.ok(SQLITE_FUDABA_SCHEMA.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
    }
    for (const fragment of [
        'pending_cover_object_key',
        'pending_cover_submitted_at',
        'revision INTEGER NOT NULL DEFAULT 0',
        'hidden_by_account_id'
    ]) {
        assert.ok(workflowMigration.includes(fragment));
        assert.ok(SQLITE_FUDABA_SCHEMA.includes(fragment));
    }
    for (const fragment of [
        'fudaba_geocoder_cache',
        'fudaba_mutation_receipts'
    ]) {
        assert.ok(workflowMigration.includes(fragment));
        assert.ok(SQLITE_FUDABA_WORKFLOW_SCHEMA.includes(fragment));
    }
    for (const trigger of [
        'fudaba_offices_pending_cover_update_check',
        'fudaba_office_cards_transition_update',
        'fudaba_messages_hidden_update_check'
    ]) {
        assert.ok(workflowMigration.includes(trigger));
        assert.ok(SQLITE_FUDABA_WORKFLOW_SCHEMA.includes(trigger));
    }
});

test('SQLite initializes all Fudaba tables and the canonical series catalog', async (t) => {
    const fixture = await createFixture(t);
    await fixture.repository.initialize();

    const tables = await fixture.database.prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name LIKE 'fudaba_%'
         ORDER BY name`
    ).all<{ name: string }>();
    assert.deepEqual(tables.results.map(({ name }) => name), [
        'fudaba_card_favorites',
        'fudaba_card_likes',
        'fudaba_cards',
        'fudaba_exchange_requests',
        'fudaba_geocoder_cache',
        'fudaba_messages',
        'fudaba_moderation_cases',
        'fudaba_mutation_receipts',
        'fudaba_office_cards',
        'fudaba_office_public_locations',
        'fudaba_office_series_tags',
        'fudaba_offices',
        'fudaba_rate_limit_windows',
        'fudaba_series_tags'
    ]);
    const series = await fixture.database.prepare(
        `SELECT code, display_order, enabled
         FROM fudaba_series_tags ORDER BY display_order`
    ).all<{ code: string; display_order: number; enabled: number }>();
    assert.deepEqual(series.results, [
        { code: '765as', display_order: 0, enabled: 1 },
        { code: 'cinderella', display_order: 1, enabled: 1 },
        { code: 'million-live', display_order: 2, enabled: 1 },
        { code: 'sidem', display_order: 3, enabled: 1 },
        { code: 'shiny-colors', display_order: 4, enabled: 1 },
        { code: 'gakuen', display_order: 5, enabled: 1 },
        { code: 'valiv', display_order: 6, enabled: 1 }
    ]);
});

test('office creation and series assignment are atomic', async (t) => {
    const fixture = await createFixture(t);
    await seedPlatformAccount(fixture, 'office-owner');

    await assert.rejects(fixture.repository.createOffice(office(
        'rolled-back-office',
        'office-owner',
        { seriesCodes: ['765as', 'not-a-series'] }
    )));
    assert.equal(await fixture.repository.findOfficeById('rolled-back-office'), null);
    assert.equal(await fixture.database.prepare(
        'SELECT COUNT(*) AS count FROM fudaba_office_series_tags WHERE office_id=?'
    ).bind('rolled-back-office').first<number>('count'), 0);

    const created = await fixture.repository.createOffice(office(
        'atomic-office',
        'office-owner',
        { slug: '上海-事务所', seriesCodes: ['765as', 'cinderella'] }
    ));
    assert.equal(created.owner_account_id, 'office-owner');
    assert.equal(created.slug, '上海-事务所');
    await fixture.database.prepare(
        `INSERT INTO fudaba_office_series_tags
            (office_id, series_code, display_order)
         VALUES (?, 'million-live', 1)`
    ).bind(created.id).run();
    const assigned = await fixture.database.prepare(
        `SELECT series_code, display_order FROM fudaba_office_series_tags
         WHERE office_id=? ORDER BY display_order, series_code`
    ).bind(created.id).all<{ series_code: string; display_order: number }>();
    assert.deepEqual(assigned.results, [
        { series_code: '765as', display_order: 0 },
        { series_code: 'cinderella', display_order: 1 },
        { series_code: 'million-live', display_order: 1 }
    ]);
});

async function assertOwnerAndArchiveBoundary(
    t: TestContext,
    dialect: 'sqlite' | 'postgresql'
): Promise<void> {
    const fixture = await createFixture(t, dialect);
    for (const accountId of ['owner', 'intruder', 'requester']) {
        await seedPlatformAccount(fixture, `${dialect}-${accountId}`);
    }
    const ownerId = `${dialect}-owner`;
    const intruderId = `${dialect}-intruder`;
    const requesterId = `${dialect}-requester`;
    const officeId = `${dialect}-archive-office`;
    const wantedId = `${dialect}-wanted-card`;
    const blockedId = `${dialect}-blocked-card`;
    await fixture.repository.createOffice(office(officeId, ownerId, {
        slug: `上海-${dialect}`
    }));
    await fixture.repository.createCard(card(wantedId, ownerId));
    await fixture.repository.createCard(card(blockedId, ownerId));

    assert.equal(await placeCard(fixture, officeId, wantedId, intruderId), false);
    assert.equal(await fixture.database.prepare(
        'SELECT COUNT(*) AS count FROM fudaba_office_cards WHERE office_id=?'
    ).bind(officeId).first<number>('count'), 0);
    assert.equal(await placeCard(fixture, officeId, wantedId, ownerId), true);

    assert.equal(await fixture.repository.updateOfficeStatusForOwner({
        officeId,
        ownerAccountId: intruderId,
        status: 'archived',
        archivedAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
        expectedRevision: 0
    }), false);
    assert.equal(await fixture.repository.updateOfficeStatusForOwner({
        officeId,
        ownerAccountId: ownerId,
        status: 'archived',
        archivedAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
        expectedRevision: 0
    }), true);
    assert.equal(await placeCard(fixture, officeId, blockedId, ownerId, 2), false);
    assert.equal(await fixture.repository.createMessage({
        id: `${dialect}-blocked-message`,
        officeId,
        authorAccountId: requesterId,
        content: 'This must not be persisted.',
        createdAt: UPDATED_AT
    }), false);
    assert.equal(await fixture.repository.createExchangeRequest({
        id: `${dialect}-blocked-exchange`,
        officeId,
        requesterAccountId: requesterId,
        recipientAccountId: ownerId,
        wantedCardId: wantedId,
        offeredCardId: null,
        note: '',
        createdAt: UPDATED_AT
    }), null);

    await assert.rejects(fixture.database.prepare(
        `INSERT INTO fudaba_office_cards
            (office_id, card_id, pinned_at, position_x, position_y, rotation, z_index)
         VALUES (?, ?, ?, 50, 50, 0, 3)`
    ).bind(officeId, blockedId, UPDATED_AT).run());
    await assert.rejects(fixture.database.prepare(
        `INSERT INTO fudaba_messages
            (id, office_id, author_account_id, content, created_at)
         VALUES (?, ?, ?, 'Bypassed repository', ?)`
    ).bind(`${dialect}-direct-message`, officeId, requesterId, UPDATED_AT).run());
    await assert.rejects(fixture.database.prepare(
        `INSERT INTO fudaba_exchange_requests
            (id, office_id, requester_account_id, recipient_account_id,
             wanted_card_id, offered_card_id, note, status, version,
             created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL, '', 'pending', 0, ?, ?, NULL)`
    ).bind(
        `${dialect}-direct-exchange`,
        officeId,
        requesterId,
        ownerId,
        wantedId,
        UPDATED_AT,
        UPDATED_AT
    ).run());
}

test('SQLite conditions card placement on ownership and blocks archived writes', async (t) => {
    await assertOwnerAndArchiveBoundary(t, 'sqlite');
});

async function assertExchangeConstraints(
    t: TestContext,
    dialect: 'sqlite' | 'postgresql'
): Promise<void> {
    const fixture = await createFixture(t, dialect);
    const requesterId = `${dialect}-exchange-requester`;
    const recipientId = `${dialect}-exchange-recipient`;
    const otherId = `${dialect}-exchange-other`;
    const officeId = `${dialect}-exchange-office`;
    const wantedCardId = `${dialect}-wanted-card`;
    const offeredCardId = `${dialect}-offered-card`;
    const otherCardId = `${dialect}-other-card`;
    const exchangeId = `${dialect}-valid-exchange`;
    for (const accountId of [requesterId, recipientId, otherId]) {
        await seedPlatformAccount(fixture, accountId);
    }
    await fixture.repository.createOffice(office(officeId, recipientId));
    await fixture.repository.createCard(card(wantedCardId, recipientId));
    await fixture.repository.createCard(card(offeredCardId, requesterId));
    await fixture.repository.createCard(card(otherCardId, otherId));
    assert.equal(await placeCard(
        fixture,
        officeId,
        wantedCardId,
        recipientId
    ), true);

    assert.equal(await fixture.repository.createExchangeRequest({
        id: `${dialect}-wrong-wanted-owner`,
        officeId,
        requesterAccountId: requesterId,
        recipientAccountId: otherId,
        wantedCardId,
        offeredCardId,
        note: '',
        createdAt: CREATED_AT
    }), null);
    assert.equal(await fixture.repository.createExchangeRequest({
        id: `${dialect}-wrong-offered-owner`,
        officeId,
        requesterAccountId: requesterId,
        recipientAccountId: recipientId,
        wantedCardId,
        offeredCardId: otherCardId,
        note: '',
        createdAt: CREATED_AT
    }), null);
    await assert.rejects(fixture.database.prepare(
        `INSERT INTO fudaba_exchange_requests
            (id, office_id, requester_account_id, recipient_account_id,
             wanted_card_id, offered_card_id, note, status, version,
             created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL, '', 'pending', 0, ?, ?, NULL)`
    ).bind(
        `${dialect}-direct-wrong-wanted-owner`,
        officeId,
        requesterId,
        otherId,
        wantedCardId,
        CREATED_AT,
        CREATED_AT
    ).run());
    await assert.rejects(fixture.database.prepare(
        `INSERT INTO fudaba_exchange_requests
            (id, office_id, requester_account_id, recipient_account_id,
             wanted_card_id, offered_card_id, note, status, version,
             created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, '', 'pending', 0, ?, ?, NULL)`
    ).bind(
        `${dialect}-direct-wrong-offered-owner`,
        officeId,
        requesterId,
        recipientId,
        wantedCardId,
        otherCardId,
        CREATED_AT,
        CREATED_AT
    ).run());

    const created = await fixture.repository.createExchangeRequest({
        id: exchangeId,
        officeId,
        requesterAccountId: requesterId,
        recipientAccountId: recipientId,
        wantedCardId,
        offeredCardId,
        note: 'Trade?',
        createdAt: CREATED_AT
    });
    assert.equal(created?.status, 'pending');
    assert.equal(created?.created_at, CREATED_AT);
    assert.equal(created?.offered_card_id, offeredCardId);
    assert.equal(await fixture.repository.createExchangeRequest({
        id: `${dialect}-duplicate-pending-exchange`,
        officeId,
        requesterAccountId: requesterId,
        recipientAccountId: recipientId,
        wantedCardId,
        offeredCardId: null,
        note: '',
        createdAt: UPDATED_AT
    }), null);

    await fixture.database.prepare(
        `UPDATE fudaba_exchange_requests
         SET status='accepted', version=1, updated_at=?, resolved_at=?
         WHERE id=?`
    ).bind(UPDATED_AT, UPDATED_AT, exchangeId).run();
    await assert.rejects(fixture.database.prepare(
        `UPDATE fudaba_exchange_requests
         SET status='declined', version=2, updated_at=?, resolved_at=?
         WHERE id=?`
    ).bind(RESOLVED_AT, RESOLVED_AT, exchangeId).run());
    assert.equal(await fixture.database.prepare(
        'SELECT status FROM fudaba_exchange_requests WHERE id=?'
    ).bind(exchangeId).first<string>('status'), 'accepted');
}

test('exchange requests enforce both card owners, uniqueness, and final states', async (t) => {
    await assertExchangeConstraints(t, 'sqlite');
});

test('media rights and moderation constraints cannot be bypassed', async (t) => {
    const fixture = await createFixture(t);
    await seedPlatformAccount(fixture, 'card-owner');
    const actorId = await seedBackofficeActor(fixture, 'fudaba-moderator');

    await assert.rejects(fixture.repository.createCard(card(
        'unapproved-published-card',
        'card-owner',
        { mediaRightsStatus: 'unknown', publicationStatus: 'published' }
    )));
    const published = await fixture.repository.createCard(card(
        'approved-published-card',
        'card-owner'
    ));
    assert.equal(published.media_rights_status, 'approved');
    assert.equal(published.publication_status, 'published');

    await assert.rejects(fixture.repository.createModerationCase({
        id: 'resolved-without-actor',
        resourceKind: 'card',
        resourceId: published.id,
        reporterAccountId: 'card-owner',
        reason: 'Rights review',
        details: '',
        state: 'resolved',
        backofficeActorId: null,
        resolution: 'Approved',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        resolvedAt: UPDATED_AT
    }));
    const resolved = await fixture.repository.createModerationCase({
        id: 'resolved-with-actor',
        resourceKind: 'card',
        resourceId: published.id,
        reporterAccountId: 'card-owner',
        reason: 'Rights review',
        details: '',
        state: 'resolved',
        backofficeActorId: actorId,
        resolution: 'Approved',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        resolvedAt: UPDATED_AT
    });
    assert.equal(resolved.backoffice_actor_id, actorId);
    await assert.rejects(fixture.repository.createModerationCase({
        id: 'resolved-with-missing-actor',
        resourceKind: 'card',
        resourceId: published.id,
        reporterAccountId: null,
        reason: 'Rights review',
        details: '',
        state: 'resolved',
        backofficeActorId: actorId + 10_000,
        resolution: 'Approved',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        resolvedAt: UPDATED_AT
    }));
    assert.deepEqual(
        (await fixture.database.prepare('PRAGMA foreign_key_check').all()).results,
        []
    );
});

async function assertModerationActorRetention(
    t: TestContext,
    dialect: 'sqlite' | 'postgresql'
): Promise<void> {
    const fixture = await createFixture(t, dialect);
    const actorId = await seedBackofficeActor(
        fixture,
        `${dialect}-retained-moderator`
    );
    await fixture.repository.createModerationCase({
        id: `${dialect}-retained-moderation-case`,
        resourceKind: 'office',
        resourceId: `${dialect}-office`,
        reporterAccountId: null,
        reason: 'Policy review',
        details: '',
        state: 'resolved',
        backofficeActorId: actorId,
        resolution: 'Retain actor identity',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        resolvedAt: UPDATED_AT
    });
    const core = new SqlCoreRepository(
        fixture.database,
        dialect === 'sqlite' ? new SqliteSchemaStrategy() : initializedPostgresSchema
    );

    assert.equal(await core.deleteAdminAccount(actorId), 'moderation-history');
    const accountTable = dialect === 'sqlite' ? 'users' : 'backoffice_accounts';
    assert.equal(await fixture.database.prepare(
        `SELECT COUNT(*) AS count FROM ${accountTable} WHERE id=?`
    ).bind(actorId).first<number>('count'), 1);
    assert.equal(await fixture.database.prepare(
        `SELECT backoffice_actor_id FROM fudaba_moderation_cases WHERE id=?`
    ).bind(`${dialect}-retained-moderation-case`).first<number>(
        'backoffice_actor_id'
    ), actorId);
}

test('SQLite retains actors referenced by resolved moderation cases', async (t) => {
    await assertModerationActorRetention(t, 'sqlite');
});

test('real PostgreSQL enforces Fudaba ownership and archived-office constraints', {
    skip: !postgresIntegrationEnabled() &&
        'set IMS_TEST_POSTGRES_ADMIN_URL to a local PostgreSQL admin database'
}, async (t) => {
    await assertOwnerAndArchiveBoundary(t, 'postgresql');
});

test('real PostgreSQL enforces exchange ownership and final-state constraints', {
    skip: !postgresIntegrationEnabled() &&
        'set IMS_TEST_POSTGRES_ADMIN_URL to a local PostgreSQL admin database'
}, async (t) => {
    await assertExchangeConstraints(t, 'postgresql');
});

test('real PostgreSQL retains actors referenced by resolved moderation cases', {
    skip: !postgresIntegrationEnabled() &&
        'set IMS_TEST_POSTGRES_ADMIN_URL to a local PostgreSQL admin database'
}, async (t) => {
    await assertModerationActorRetention(t, 'postgresql');
});
