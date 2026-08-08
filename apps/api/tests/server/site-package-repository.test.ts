import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import type { ManagedSqlDatabase, SqlResult } from '@/infra/db/sql/database';
import { executeSql } from '@/infra/db/sql/query';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { createPostgresTestDatabase } from './postgres-test-database';

function revision(packageId: string, id: string, token: string, createdAt: number) {
    const prefix = `site-packages/${packageId}/revisions/${id}`;
    return {
        id,
        packageId,
        entryPath: 'index.html',
        runtimeMode: 'safe' as const,
        state: 'ready' as const,
        fileCount: 1,
        totalBytes: 25,
        sourceKey: `${prefix}/source.zip`,
        sourceSha256: 'c'.repeat(64),
        manifestKey: `${prefix}/manifest.json`,
        manifestJson: JSON.stringify({
            'index.html': `${prefix}/files/index.html`
        }),
        previewTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        createdBy: 7,
        createdAt
    };
}

test('PostgreSQL site packages create revisions and atomically switch rollback pointers', async (t) => {
    const database = await createPostgresTestDatabase(t, 'site-package');
    const schema = new PostgresqlSchemaStrategy();
    const repository = new SqlCoreRepository(database, schema);
    t.after(() => repository.close());
    await repository.initialize();

    const packageId = '11111111-1111-4111-8111-111111111111';
    const firstId = '22222222-2222-4222-8222-222222222222';
    const secondId = '33333333-3333-4333-8333-333333333333';
    await repository.createSitePackageWithRevision({
        id: packageId,
        slug: 'hiro-2026',
        title: 'Hiro 2026',
        description: 'Uploaded package',
        createdBy: 7,
        createdAt: 1_000
    }, revision(packageId, firstId, 'a'.repeat(64), 1_000));

    await assert.rejects(
        executeSql(database, 'UPDATE site_packages SET slug=? WHERE id=?', ['Bad_Slug', packageId]),
        /check constraint/i
    );
    await assert.rejects(
        executeSql(database,
            'UPDATE site_package_revisions SET source_sha256=? WHERE id=?',
            ['C'.repeat(64), firstId]
        ),
        /check constraint/i
    );
    await assert.rejects(
        executeSql(database,
            'UPDATE site_package_revisions SET preview_token_hash=? WHERE id=?',
            ['z'.repeat(64), firstId]
        ),
        /check constraint/i
    );

    const second = await repository.createSitePackageRevision(
        revision(packageId, secondId, 'b'.repeat(64), 2_000)
    );
    assert.equal(second.revision_number, 2);
    assert.equal((await repository.listSitePackages())[0]?.revisions.length, 2);

    const firstPublication = await repository.publishSitePackageRevision(
        packageId, firstId, 7, 3_000
    );
    assert.equal(firstPublication?.operation, 'publish');
    assert.equal(firstPublication?.revision.published_at, 3_000);
    assert.equal((await repository.findSitePackageById(packageId))?.published_revision_id, firstId);
    assert.equal(
        (await repository.findSitePackageRevisionById(packageId, firstId))?.published_at,
        3_000
    );

    const secondPublication = await repository.publishSitePackageRevision(
        packageId, secondId, 8, 4_000
    );
    assert.equal(secondPublication?.operation, 'publish');
    assert.equal(secondPublication?.revision.published_at, 4_000);
    assert.equal((await repository.findSitePackageById(packageId))?.published_revision_id, secondId);

    const rollbackPublication = await repository.publishSitePackageRevision(
        packageId, firstId, 9, 5_000
    );
    assert.equal(rollbackPublication?.operation, 'rollback');
    assert.equal(
        rollbackPublication?.revision.published_at,
        3_000,
        'rollback returns the original publication timestamp'
    );
    const rolledBack = await repository.findSitePackageById(packageId);
    assert.equal(rolledBack?.published_revision_id, firstId);
    assert.equal(rolledBack?.updated_by, 9);
    assert.equal(
        (await repository.findSitePackageRevisionById(packageId, firstId))?.published_at,
        3_000,
        'rollback preserves the original immutable publication timestamp'
    );

    const overlappingDatabase = new Proxy(database, {
        get(target, property, receiver) {
            if (property === 'batch') {
                return async (): Promise<SqlResult[]> => [0, 1, 2].map(() => ({
                    results: [],
                    success: true,
                    meta: { changes: 0 }
                }));
            }
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
        }
    }) as ManagedSqlDatabase;
    const overlappingRepository = new SqlCoreRepository(overlappingDatabase, schema);
    const overlappingRollback = await overlappingRepository.publishSitePackageRevision(
        packageId,
        firstId,
        10,
        6_000
    );
    assert.equal(
        overlappingRollback?.operation,
        'noop',
        'a concurrent loser observes the winner current pointer as idempotent success'
    );
    assert.equal(overlappingRollback?.revision.id, firstId);

    assert.equal(
        await repository.publishSitePackageRevision(
            packageId,
            '44444444-4444-4444-8444-444444444444',
            9,
            7_000
        ),
        null
    );

    const otherPackageId = '55555555-5555-4555-8555-555555555555';
    const otherRevisionId = '66666666-6666-4666-8666-666666666666';
    await repository.createSitePackageWithRevision({
        id: otherPackageId,
        slug: 'another-site',
        title: 'Another site',
        description: '',
        createdBy: 7,
        createdAt: 7_000
    }, revision(otherPackageId, otherRevisionId, 'd'.repeat(64), 7_000));
    await assert.rejects(
        executeSql(database,
            'UPDATE site_packages SET published_revision_id=? WHERE id=?',
            [otherRevisionId, packageId]
        ),
        /belongs to another site package|foreign key constraint/i
    );
});
