import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { SqliteConnection } from '@/infra/db/sqlite/connection';

const LEGACY_SITE_PACKAGE_SCHEMA = `
    PRAGMA foreign_keys = ON;
    CREATE TABLE site_packages (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE CHECK (slug <> ''),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        published_revision_id TEXT,
        created_by INTEGER NOT NULL,
        updated_by INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(published_revision_id) REFERENCES site_package_revisions(id)
            ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
    );
    CREATE TABLE site_package_revisions (
        id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL CHECK (revision_number > 0),
        entry_path TEXT NOT NULL,
        runtime_mode TEXT NOT NULL CHECK (runtime_mode IN ('safe', 'isolated-script')),
        state TEXT NOT NULL CHECK (state IN ('ready', 'archived')),
        file_count INTEGER NOT NULL CHECK (file_count > 0),
        total_bytes INTEGER NOT NULL CHECK (total_bytes >= 0),
        source_key TEXT NOT NULL UNIQUE,
        source_sha256 TEXT NOT NULL,
        manifest_key TEXT NOT NULL UNIQUE,
        manifest_json TEXT NOT NULL,
        preview_token_hash TEXT NOT NULL UNIQUE,
        created_by INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        published_at INTEGER,
        UNIQUE(package_id, revision_number),
        FOREIGN KEY(package_id) REFERENCES site_packages(id)
            ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    );
`;

const PACKAGE_A = '11111111-1111-4111-8111-111111111111';
const PACKAGE_B = '22222222-2222-4222-8222-222222222222';
const REVISION_A = '33333333-3333-4333-8333-333333333333';
const REVISION_B = '44444444-4444-4444-8444-444444444444';

async function migrationSql(): Promise<string> {
    return fs.readFile(
        path.resolve(process.cwd(), 'migrations/core/0008_site_package_integrity.sql'),
        'utf8'
    );
}

async function createLegacyDatabase(t: TestContext): Promise<SqliteConnection> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-site-package-migration-'));
    const database = new SqliteConnection(path.join(root, 'core.sqlite'));
    t.after(async () => {
        await database.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await database.executeScript(LEGACY_SITE_PACKAGE_SCHEMA);
    for (const [id, slug] of [[PACKAGE_A, 'package-a'], [PACKAGE_B, 'package-b']]) {
        await database.run(
            `INSERT INTO site_packages
             (id, slug, title, description, published_revision_id,
              created_by, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, '', NULL, 1, 1, 1000, 1000)`,
            [id, slug, slug]
        );
    }
    return database;
}

async function insertRevision(
    database: SqliteConnection,
    packageId: string,
    revisionId: string,
    revisionNumber: number
): Promise<void> {
    const prefix = `site-packages/${packageId}/revisions/${revisionId}`;
    await database.run(
        `INSERT INTO site_package_revisions
         (id, package_id, revision_number, entry_path, runtime_mode, state,
          file_count, total_bytes, source_key, source_sha256, manifest_key,
          manifest_json, preview_token_hash, created_by, created_at, published_at)
         VALUES (?, ?, ?, 'index.html', 'safe', 'ready', 1, 10,
                 ?, ?, ?, '{}', ?, 1, 1000, 1000)`,
        [
            revisionId,
            packageId,
            revisionNumber,
            `${prefix}/source.zip`,
            'a'.repeat(64),
            `${prefix}/manifest.json`,
            revisionId === REVISION_A ? 'b'.repeat(64) : 'c'.repeat(64)
        ]
    );
}

test('SQLite 0008 fails before installing guards when legacy ownership is invalid', async (t) => {
    const database = await createLegacyDatabase(t);
    await insertRevision(database, PACKAGE_A, REVISION_A, 1);
    await insertRevision(database, PACKAGE_B, REVISION_B, 1);
    await database.run(
        'UPDATE site_packages SET published_revision_id=? WHERE id=?',
        [REVISION_B, PACKAGE_A]
    );

    assert.deepEqual(await database.all('PRAGMA foreign_key_check'), []);
    await assert.rejects(
        database.executeScript(await migrationSql()),
        /site_package_integrity_preflight/
    );
    assert.deepEqual(
        await database.all(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'site_package%check'"
        ),
        [],
        'the failed preflight must precede persistent trigger installation'
    );
});

test('SQLite 0008 prevents moving a published revision to another package', async (t) => {
    const database = await createLegacyDatabase(t);
    await insertRevision(database, PACKAGE_A, REVISION_A, 1);
    await database.run(
        'UPDATE site_packages SET published_revision_id=? WHERE id=?',
        [REVISION_A, PACKAGE_A]
    );

    await database.executeScript(await migrationSql());
    await assert.rejects(
        database.run(
            'UPDATE site_package_revisions SET package_id=? WHERE id=?',
            [PACKAGE_B, REVISION_A]
        ),
        /published revision must remain with its site package/
    );
    assert.deepEqual(
        await database.get<{ package_id: string }>(
            'SELECT package_id FROM site_package_revisions WHERE id=?',
            [REVISION_A]
        ),
        { package_id: PACKAGE_A }
    );
    assert.deepEqual(await database.all('PRAGMA foreign_key_check'), []);
});
