import assert from 'node:assert/strict';
import { test } from 'vitest';
import { executeSql, queryOne } from '@/infra/db/sql/query';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import {
    createFudabaRepositoryFixture,
    makeFudabaCardInput,
    seedPlatformAccount
} from '../fixtures/fudaba-card-fixture';
import { postgresIntegrationEnabled } from '../integration/postgres-harness';
import { executeNamecardSortKeyBackfill } from '../../scripts/migration/namecard-sort-keys';

const CREATED_AT = '2026-11-18T00:00:00.000Z';
const UPDATED_AT = '2026-11-18T01:00:00.000Z';

interface SortColumns {
    sort_name_key: string;
    sort_name_bucket: number;
}

function readSortColumns(
    database: ManagedSqlDatabase,
    id: string
): Promise<SortColumns | null> {
    return queryOne<SortColumns>(
        database,
        `SELECT sort_name_key, sort_name_bucket FROM fudaba_cards WHERE id=?`,
        [id]
    );
}

test.describe('namecard sort metadata', () => {
    test('create and owner edit keep the two columns in sync', {
        skip: !postgresIntegrationEnabled()
    }, async () => {
        const fixture = await createFudabaRepositoryFixture();
        await seedPlatformAccount(fixture, 'sort-owner');

        // Archived/admin insert path: the name is Chinese and there is no reading.
        await fixture.repository.createCard(
            makeFudabaCardInput('sort-card', 'sort-owner', {
                producerName: '天海春香',
                producerReading: null,
                favoriteCharacterIds: [],
                publicationStatus: 'published'
            })
        );
        assert.deepEqual(await readSortColumns(fixture.database, 'sort-card'), {
            sort_name_key: 'tianhaichunxiang',
            sort_name_bucket: 2
        });

        // Editing only the reading on a published card is exempt from review:
        // the live row must move to the kana bucket without touching the name.
        const readingEdit = await fixture.repository.updateCardMetadataForOwner({
            cardId: 'sort-card',
            ownerAccountId: 'sort-owner',
            producerName: '天海春香',
            seriesCodes: ['765'],
            favoriteCharacterIds: [],
            bio: '',
            tradeNote: '',
            exchangeMode: 'manual',
            madeOn: null,
            groupName: null,
            producerReading: 'アマミ ハルカ',
            isOriginal: false,
            madeWithAi: false,
            visible: true,
            expectedRevision: 0,
            updatedAt: UPDATED_AT
        });
        assert.equal(readingEdit.status, 'saved');
        assert.deepEqual(await readSortColumns(fixture.database, 'sort-card'), {
            sort_name_key: 'amamiharuka',
            sort_name_bucket: 1
        });

        // Owner-created pending card: a full name edit lands on the live row.
        const created = await fixture.repository.createCardForOwner({
            id: 'sort-owner-card',
            ownerAccountId: 'sort-owner',
            producerName: 'Amami Haruka',
            seriesCodes: ['765'],
            favoriteCharacterIds: [],
            bio: '',
            tradeNote: '',
            exchangeMode: 'manual',
            madeOn: null,
            groupName: null,
            producerReading: null,
            isOriginal: false,
            madeWithAi: false,
            visible: true,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT
        });
        assert.equal(created.status, 'saved');
        assert.deepEqual(
            await readSortColumns(fixture.database, 'sort-owner-card'),
            { sort_name_key: 'amamiharuka', sort_name_bucket: 0 }
        );

        const renamed = await fixture.repository.updateCardMetadataForOwner({
            cardId: 'sort-owner-card',
            ownerAccountId: 'sort-owner',
            producerName: '星井美希',
            seriesCodes: ['765'],
            favoriteCharacterIds: [],
            bio: '',
            tradeNote: '',
            exchangeMode: 'manual',
            madeOn: null,
            groupName: null,
            producerReading: null,
            isOriginal: false,
            madeWithAi: false,
            visible: true,
            expectedRevision: 0,
            updatedAt: UPDATED_AT
        });
        assert.equal(renamed.status, 'saved');
        assert.deepEqual(
            await readSortColumns(fixture.database, 'sort-owner-card'),
            { sort_name_key: 'xingjingmeixi', sort_name_bucket: 2 }
        );
    });

    test('the backfill repairs drift and is idempotent', {
        skip: !postgresIntegrationEnabled()
    }, async () => {
        const fixture = await createFudabaRepositoryFixture();
        await seedPlatformAccount(fixture, 'sort-backfill-owner');
        await fixture.repository.createCard(
            makeFudabaCardInput('sort-backfill-card', 'sort-backfill-owner', {
                producerName: '天海春香',
                producerReading: 'アマミ ハルカ',
                favoriteCharacterIds: []
            })
        );
        await executeSql(
            fixture.database,
            `UPDATE fudaba_cards SET sort_name_key='drifted', sort_name_bucket=0 WHERE id=?`,
            ['sort-backfill-card']
        );

        const dryRun = await executeNamecardSortKeyBackfill(fixture.database, {
            apply: false
        });
        assert.equal(dryRun.mode, 'dry-run');
        assert.ok(dryRun.changed >= 1);
        assert.equal(dryRun.applied, 0);
        assert.deepEqual(
            await readSortColumns(fixture.database, 'sort-backfill-card'),
            { sort_name_key: 'drifted', sort_name_bucket: 0 }
        );

        const applied = await executeNamecardSortKeyBackfill(fixture.database, {
            apply: true
        });
        assert.equal(applied.mode, 'apply');
        assert.equal(applied.applied, applied.changed);
        assert.deepEqual(
            await readSortColumns(fixture.database, 'sort-backfill-card'),
            { sort_name_key: 'amamiharuka', sort_name_bucket: 1 }
        );

        const again = await executeNamecardSortKeyBackfill(fixture.database, {
            apply: true
        });
        assert.equal(again.changed, 0);
        assert.equal(again.applied, 0);
    });
});
