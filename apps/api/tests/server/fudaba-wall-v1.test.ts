import { insertBackofficeAccount } from '../fixtures/rows';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { onTestFinished, test } from 'vitest';
import { createHonoApp } from '@/app';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import type { ObjectStorage } from '@/ports/object-storage';
import type { SqlSchemaStrategy } from '@/infra/db/sql/database';
import {
    createPostgresTestDatabase,
    connectPostgresTestDatabase,
} from '../postgres-test-database';
import { createPostgresTestHarness } from '../integration/postgres-harness';
import { createMigrationCatalogBefore } from '../integration/migration-catalog';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import {
    parseWallQuery,
    encodeWallCursor,
} from '@/domains/community/fudaba/directory/wall-query';
import { fudabaWallResponseSchema } from '@imsweb/contracts/fudaba/wall';
import { readContractJson as contractJson } from '../contracts/contract-json';

const noopSchema: SqlSchemaStrategy = {
    initializeCore: async () => {},
    initializePlatform: async () => {},
    initializeFudaba: async () => {},
    initializeStory: async () => {},
};
const time = '2026-08-03T00:00:00.000Z';
const require = createRequire(__filename);
const {
    migratePostgres,
} = require('../../scripts/migration/postgres-migrations.js');

async function seed(
    database: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
    count: number,
    legacySchema = false,
) {
    await seedCanonicalFudabaAgencies(database);
    await database
        .prepare(
            `INSERT INTO platform_accounts
        (id,status,token_version,created_at,updated_at) VALUES
        ('wall-owner','active',0,0,0),('wall-other','active',0,0,0)`,
        )
        .run();
    await database
        .prepare(
            `INSERT INTO fudaba_offices
        (id,owner_account_id,slug,name,city,address,latitude,longitude,created_at,updated_at)
        VALUES ('wall-office','wall-owner','wall-office','Wall','Shanghai','Address',31,121,?,?)`,
        )
        .bind(time, time)
        .run();
    if (!legacySchema) {
    const wallReviewer = await insertBackofficeAccount(database, 'wall-office-reviewer');
    await database.prepare("UPDATE fudaba_offices SET review_state='published', review_submitted_at=created_at, reviewed_at=updated_at, reviewed_by=?, review_note='', review_operation_id=NULL, review_audit_id=?")
      .bind(wallReviewer, '00000000-0000-4000-8000-000000000001').run();
    }

    await database
        .prepare(
            `INSERT INTO fudaba_cards
        (id,owner_account_id,producer_name,
        ${legacySchema ? 'front_object_key,back_object_key,' : ''}publication_status,created_at,updated_at)
        SELECT 'wall-card-' || lpad(n::text,4,'0'), 'wall-owner','Producer',
        ${legacySchema ? "'community/fudaba/' || n || '/front.webp','community/fudaba/' || n || '/back.webp'," : ''}
        'published',?::timestamptz,?::timestamptz FROM generate_series(1,?) n`,
        )
        .bind(time, time, count)
        .run();
    if (!legacySchema) {
        await database.prepare(
            "INSERT INTO fudaba_card_pages(card_id,queue,page_id,display_order,object_version,width,height,created_at,updated_at) SELECT id,'live','front',1,'11111111-1111-4111-8111-111111111111',240,160,created_at,updated_at FROM fudaba_cards WHERE id LIKE 'wall-card-%'"
        ).run();
        await database.prepare(
            "INSERT INTO fudaba_card_series(card_id,series_code,display_order) SELECT id,'765',1 FROM fudaba_cards WHERE id LIKE 'wall-card-%'"
        ).run();
    }
}

test('world wall uses bounded stable pages, atomic expansion, ownership and CAS with 1000 cards', async () => {
    const database = await createPostgresTestDatabase('wall_v1');
    await seed(database, 1000);
    await database
        .prepare(
            `INSERT INTO fudaba_office_cards
        (office_id,card_id,pinned_at,world_x,world_y,rotation,z_index,revision,updated_at)
        SELECT 'wall-office',id,?::timestamptz,
        CASE WHEN id='wall-card-1000' THEN 10000 ELSE 800 END,450,0,
        right(id,4)::int,0,?::timestamptz FROM fudaba_cards ORDER BY id`,
        )
        .bind(time, time)
        .run();
    const repo = new SqlFudabaRepository(database, noopSchema);
    const other = new SqlFudabaRepository(
        connectPostgresTestDatabase(database),
        noopSchema,
    );
    const query = { limit: 50, scope: 'all' };
    const first = await repo.findPublicWall('wall-office', 'wall-owner', query);
    assert.equal(first!.wall.total, 1000);
    assert.equal(first!.office.cards.length, 51); // One lookahead row; HTTP sends at most 50.
    const found = new Set<string>();
    let after: { pinnedAt: string; id: string } | undefined;
    do {
        const result = await repo.findPublicWall('wall-office', null, {
            ...query,
            after,
        });
        const page = result!.office.cards.slice(0, 50);
        page.forEach((card) => {
            assert.ok(!found.has(card.id));
            found.add(card.id);
        });
        after =
            result!.office.cards.length > 50
                ? result!.cursorPosition!
                : undefined;
    } while (after);
    assert.equal(found.size, 1000);
    const distant = await repo.findPublicWall('wall-office', null, {
        ...query,
        bbox: [9500, 0, 10500, 900],
    });
    assert.deepEqual(
        distant!.office.cards.map((card) => card.id),
        ['wall-card-1000'],
    );
    const before = distant!.wall;
    const input = {
        officeId: 'wall-office',
        cardId: 'wall-card-1000',
        ownerAccountId: 'wall-owner',
        positionX: 15000,
        positionY: -1000,
        rotation: 8,
        zIndex: 2_147_483_000,
        expectedRevision: 0,
        updatedAt: '2026-08-03T00:01:00.000Z',
    };
    assert.deepEqual(
        await repo.saveCardPlacementForOwner({
            ...input,
            ownerAccountId: 'wall-other',
        }),
        { status: 'unavailable' },
    );
    const results = await Promise.all([
        repo.saveCardPlacementForOwner(input),
        other.saveCardPlacementForOwner(input),
    ]);
    assert.equal(
        results.filter((result) => result.status === 'saved').length,
        1,
    );
    assert.equal(
        results.filter((result) => result.status === 'conflict').length,
        1,
    );
    const final = await repo.findPublicWall('wall-office', 'wall-owner', {
        ...query,
        cardId: input.cardId,
    });
    assert.ok(final!.wall.right > before.right);
    assert.ok(final!.wall.top <= -1000);
    assert.equal(final!.wall.maxZIndex, 1001);
    assert.equal(final!.office.cards[0]!.position_x, 15000);
    assert.equal(final!.office.cards[0]!.z_index, 1001);
    // A rejected duplicate create must not grow the wall or consume a stack order.
    await repo.saveCardPlacementForOwner({
        ...input,
        positionX: 900000,
        expectedRevision: null,
    });
    assert.deepEqual(
        (await repo.findPublicWall('wall-office', null, query))!.wall,
        final!.wall,
    );
    const legacy = await repo.findPublicOfficeBySlug('wall-office', null);
    const projected = legacy!.cards.find((card) => card.id === input.cardId)!;
    assert.equal(projected.position_x, 100);
    assert.equal(projected.position_y, 0);
    assert.equal(projected.z_index, 999);
    assert.equal(
        (await repo.findPublicWall('wall-office', null, {
            ...query,
            owned: true,
        }))!.office.cards.length,
        0,
    );
    await database
        .prepare(
            "UPDATE fudaba_offices SET is_open=false WHERE id='wall-office'",
        )
        .run();
    assert.equal(
        (
            await repo.saveCardPlacementForOwner({
                ...input,
                expectedRevision: 1,
            })
        ).status,
        'unavailable',
    );
    await database
        .prepare(
            "UPDATE fudaba_offices SET status='hidden' WHERE id='wall-office'",
        )
        .run();
    assert.equal(await repo.findPublicWall('wall-office', null, query), null);
}, 30000);

test('public wall endpoint validates exact DTOs and query scopes with PostgreSQL', async () => {
    const database = await createPostgresTestDatabase('wall_http');
    await seed(database, 2);
    const repo = new SqlFudabaRepository(database, noopSchema);
    for (const cardId of ['wall-card-0001', 'wall-card-0002']) {
        await repo.saveCardPlacementForOwner({
            officeId: 'wall-office',
            cardId,
            ownerAccountId: 'wall-owner',
            positionX: 800,
            positionY: 450,
            rotation: 0,
            zIndex: 1,
            expectedRevision: null,
            updatedAt: '2026-08-03T00:00:00.000123Z',
        });
    }
    const storage = {
        createPublicReadUrl: async (key: string) =>
            'https://media.example/' + key,
    } as unknown as ObjectStorage;
    const app = createHonoApp(() => ({
        fudaba: repo,
        storage,
        config: { fudabaPublicReadEnabled: true },
    }));
    const response = await app.request(
        'http://ims.test/api/community/exchange/offices/wall-office/wall?bbox=0,0,1600,900',
    );
    assert.equal(response.status, 200);
    const body = await contractJson(response, fudabaWallResponseSchema);
    assert.equal(body.office.cards.length, 2);
    assert.equal(body.office.cards[0]!.placement.x, 800);
    const first = await contractJson(
        await app.request(
            'http://ims.test/api/community/exchange/offices/wall-office/wall?limit=1',
        ),
        fudabaWallResponseSchema,
    );
    assert.equal(first.office.cards[0]!.id, 'wall-card-0001');
    const second = await contractJson(
        await app.request(
            'http://ims.test/api/community/exchange/offices/wall-office/wall?limit=1&cursor=' +
                first.pageInfo.nextCursor,
        ),
        fudabaWallResponseSchema,
    );
    assert.equal(second.office.cards[0]!.id, 'wall-card-0002');
    assert.equal(second.pageInfo.hasNextPage, false);
    for (const suffix of [
        'limit=101',
        'bbox=0,0,999999,900',
        'bbox=0,0,0,900',
        'bbox=0,NaN,1600,900',
        'cursor=bad',
        'unknown=1',
        'limit=50&limit=50',
    ]) {
        assert.equal(
            (
                await app.request(
                    'http://ims.test/api/community/exchange/offices/wall-office/wall?' +
                        suffix,
                )
            ).status,
            400,
        );
    }
}, 30000);

test('legacy migration preserves identities and layout when rerun', async () => {
    const migrationsPath = await createMigrationCatalogBefore(
        onTestFinished,
        '20261108120000_fudaba_wall_world.sql',
    );
    const harness = await createPostgresTestHarness({ migrationsPath });
    onTestFinished(() => harness.close());
    const database = harness.connection;
    await seed(database, 2, true);
    await database
        .prepare(
            `INSERT INTO fudaba_office_cards
        (office_id,card_id,pinned_at,position_x,position_y,rotation,z_index,revision,updated_at)
        VALUES ('wall-office','wall-card-0001',?,25,75,-8,999,0,?)`,
        )
        .bind(time, time)
        .run();
    await migratePostgres({ connectionString: harness.databaseUrl });
    const before = await database
        .prepare(
            "SELECT * FROM fudaba_office_cards WHERE card_id='wall-card-0001'",
        )
        .first();
    assert.equal((before as { world_x: number }).world_x, 480);
    assert.equal((before as { world_y: number }).world_y, 615);
    const result = await migratePostgres({
        connectionString: harness.databaseUrl,
    });
    assert.equal(result.executed.length, 0);
    assert.deepEqual(
        await database
            .prepare(
                "SELECT * FROM fudaba_office_cards WHERE card_id='wall-card-0001'",
            )
            .first(),
        before,
    );
    await assert.rejects(
        database
            .prepare(
                `UPDATE fudaba_office_cards SET position_x=50,
        revision=revision+1 WHERE card_id='wall-card-0001'`,
            )
            .run(),
        /FUDABA_WALL_LAYOUT_CONFLICT/,
    );
}, 30000);

test('wall cursor cannot be reused in another region, office or filter', () => {
    const url = 'http://ims.test/offices/one/wall?bbox=0,0,1600,900';
    const original = parseWallQuery(url);
    const cursor = encodeWallCursor(original.scope, time, 'card');
    assert.equal(parseWallQuery(url + '&cursor=' + cursor).after!.id, 'card');
    assert.throws(() =>
        parseWallQuery(url.replace('/one/', '/two/') + '&cursor=' + cursor),
    );
    assert.throws(() =>
        parseWallQuery(url.replace('1600', '1700') + '&cursor=' + cursor),
    );
    assert.throws(() => parseWallQuery(url + '&owned=true&cursor=' + cursor));
    assert.throws(() =>
        parseWallQuery(
            url +
                '&cursor=' +
                encodeWallCursor(
                    original.scope,
                    '2026-02-30T00:00:00.000Z',
                    'card',
                ),
        ),
    );
});
