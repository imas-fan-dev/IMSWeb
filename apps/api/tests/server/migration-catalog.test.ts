import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createMigrationCatalogBefore } from '../integration/migration-catalog';

const BOUNDARY = '20260816193000_namecard_ownership_foundation.sql';

test('migration catalog copies SQL files only before an existing boundary', async (t) => {
    const catalog = await createMigrationCatalogBefore(t, BOUNDARY);
    const filenames = await fs.readdir(catalog);
    assert.ok(filenames.length > 0);
    assert.equal(filenames.includes(BOUNDARY), false);
    assert.equal(filenames.every((filename) => filename.endsWith('.sql')), true);
    assert.equal(filenames.every((filename) => filename < BOUNDARY), true);
});

test('migration catalog fails before creating a fixture for a missing boundary', async (t) => {
    await assert.rejects(
        createMigrationCatalogBefore(t, 'missing-migration-boundary.sql'),
        /migration boundary not found/
    );
});
