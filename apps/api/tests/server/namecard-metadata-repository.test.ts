import assert from 'node:assert/strict';
import test from 'node:test';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { queryOne } from '@/infra/db/sql/query';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { createPostgresTestDatabase } from './postgres-test-database';

const WITHDRAWAL_TOKEN_HASH = 'a'.repeat(64);

function guestInput(hashSuffix: string) {
    return {
        image1Url: `namecards/${hashSuffix}/front.webp`,
        image2Url: `namecards/${hashSuffix}/back.webp`,
        hash1: `front-${hashSuffix}`,
        hash2: `back-${hashSuffix}`,
        ip: '127.0.0.1',
        withdrawalTokenHash: WITHDRAWAL_TOKEN_HASH,
        seriesCode: 'cg',
        idolIds: [900_002, 900_001]
    };
}

test('PostgreSQL guest namecards persist ordered cross-series idol metadata atomically', async (t) => {
    const database = await createPostgresTestDatabase(t, 'namecard-metadata');
    await seedCanonicalFudabaAgencies(database);
    const repository = new SqlCoreRepository(
        database,
        new PostgresqlSchemaStrategy()
    );
    await repository.initialize();

    const id = await repository.insertPendingCard(guestInput('valid'));
    const [pending] = await repository.listAdminCards(20, 0);
    assert.equal(pending.id, id);
    assert.equal(pending.seriesCode, 'cg');
    assert.equal(pending.submissionKind, 'guest');
    assert.ok(pending.favoriteIdols);
    assert.deepEqual(
        pending.favoriteIdols.map((idol) => ({
            id: idol.idol_id,
            agency: idol.agency_code,
            order: idol.display_order
        })),
        [
            { id: 900_002, agency: 'cg', order: 0 },
            { id: 900_001, agency: '765', order: 1 }
        ]
    );

    await database.prepare(
        "UPDATE cards SET status='approved' WHERE id=?"
    ).bind(id).run();
    const [publicCard] = await repository.listApprovedCards(20, 0);
    assert.equal(publicCard.id, id);
    assert.equal(publicCard.seriesCode, 'cg');
    assert.ok(publicCard.favoriteIdols);
    assert.deepEqual(
        publicCard.favoriteIdols.map((idol) => idol.idol_id),
        [900_002, 900_001]
    );
    const media = await repository.findApprovedCardMedia(id);
    assert.deepEqual(
        media?.favoriteIdols?.map((idol) => idol.idol_id),
        [900_002, 900_001]
    );

    await assert.rejects(
        repository.insertPendingCard({
            ...guestInput('empty'),
            idolIds: []
        }),
        /between 1 and 20 idols/
    );
    await assert.rejects(
        repository.insertPendingCard({
            ...guestInput('duplicate'),
            idolIds: [900_001, 900_001]
        }),
        /must be unique/
    );
    await assert.rejects(
        repository.insertPendingCard({
            ...guestInput('missing'),
            idolIds: [999_999]
        }),
        /do not exist/
    );
    await assert.rejects(
        repository.insertPendingCard({
            ...guestInput('too-many'),
            idolIds: Array.from({ length: 21 }, (_, index) => 910_000 + index)
        }),
        /between 1 and 20 idols/
    );
    await assert.rejects(
        repository.insertPendingCard({
            ...guestInput('missing-series'),
            seriesCode: 'missing'
        }),
        /series does not exist/
    );
    assert.equal(
        (await queryOne<{ count: number }>(
            database,
            'SELECT CAST(COUNT(*) AS INTEGER) AS count FROM cards'
        ))?.count,
        1
    );

    const legacyId = await repository.insertPendingCard({
        image1Url: 'legacy/front.webp',
        image2Url: 'legacy/back.webp',
        hash1: 'legacy-front',
        hash2: 'legacy-back',
        ip: '127.0.0.1',
        withdrawalTokenHash: 'b'.repeat(64),
        seriesCode: null,
        idolIds: [],
        submissionKind: 'legacy'
    });
    const legacy = (await repository.listAdminCards(20, 0))
        .find((card) => card.id === legacyId);
    assert.equal(legacy?.submissionKind, 'legacy');
    assert.equal(legacy?.seriesCode, null);
    assert.deepEqual(legacy?.favoriteIdols, []);
});
