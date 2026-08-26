import assert from 'node:assert/strict';
import test from 'node:test';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { executeSql, queryOne } from '@/infra/db/sql/query';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { createPostgresTestDatabase } from './postgres-test-database';

const WITHDRAWAL_TOKEN_HASH = 'a'.repeat(64);

function guestInput(hashSuffix: string) {
    return {
        image1Url: `/uploads/namecard/original/${hashSuffix}-front.webp`,
        image2Url: `/uploads/namecard/original/${hashSuffix}-back.webp`,
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

    await executeSql(database,
        "UPDATE fudaba_cards SET publication_status='published', media_rights_status='approved' WHERE card_number=?",
        [id]
    );
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
            "SELECT CAST(COUNT(*) AS INTEGER) AS count FROM fudaba_cards WHERE origin IN ('guest', 'legacy')"
        ))?.count,
        1
    );

    const legacyId = await repository.insertPendingCard({
        image1Url: '/uploads/namecard/original/legacy-front.webp',
        image2Url: '/uploads/namecard/original/legacy-back.webp',
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

test('PostgreSQL guest namecards may carry optional profile text', async (t) => {
    const database = await createPostgresTestDatabase(t, 'namecard-metadata-profile');
    await seedCanonicalFudabaAgencies(database);
    const repository = new SqlCoreRepository(
        database,
        new PostgresqlSchemaStrategy()
    );
    await repository.initialize();

    const id = await repository.insertPendingCard({
        ...guestInput('profile'),
        producerName: 'Producer Name',
        displayName: 'Display Name',
        bio: 'A short bio',
        accent: '#ABCDEF'
    });
    const row = await queryOne<{
        producer_name: string | null;
        display_name: string | null;
        bio: string | null;
        accent: string | null;
        owner_account_id: string | null;
        trade_note: string | null;
        available: boolean;
    }>(database,
        `SELECT producer_name, display_name, bio, accent, owner_account_id,
                trade_note, available
         FROM fudaba_cards WHERE card_number=?`,
        [id]
    );
    assert.deepEqual(row, {
        producer_name: 'Producer Name',
        display_name: 'Display Name',
        bio: 'A short bio',
        accent: '#ABCDEF',
        owner_account_id: null,
        trade_note: null,
        available: false
    });
});
