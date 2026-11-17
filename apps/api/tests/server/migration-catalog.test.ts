import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { onTestFinished, test } from 'vitest';
import { createMigrationCatalogBefore } from '../integration/migration-catalog';

const BOUNDARY = '20260816193000_namecard_ownership_foundation.sql';

test.describe('migration catalog', () => {
    test('copies SQL files only before an existing boundary', async () => {
        const catalog = await createMigrationCatalogBefore(onTestFinished, BOUNDARY);
        const filenames = await fs.readdir(catalog);
        assert.ok(filenames.length > 0);
        assert.equal(filenames.includes(BOUNDARY), false);
        assert.equal(filenames.every((filename) => filename.endsWith('.sql')), true);
        assert.equal(filenames.every((filename) => filename < BOUNDARY), true);
    });

    test('fails before creating a fixture for a missing boundary', async () => {
        await assert.rejects(
            createMigrationCatalogBefore(onTestFinished, 'missing-migration-boundary.sql'),
            /migration boundary not found/
        );
    });
});
