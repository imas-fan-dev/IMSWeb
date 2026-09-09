import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

const POSTGRES_MIGRATIONS = path.resolve(__dirname, '../../migrations/postgresql');

export async function createMigrationCatalogBefore(
    t: TestContext,
    boundaryFilename: string
): Promise<string> {
    const filenames = await fs.readdir(POSTGRES_MIGRATIONS);
    if (!filenames.includes(boundaryFilename)) {
        throw new Error(`PostgreSQL migration boundary not found: ${boundaryFilename}`);
    }

    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-pg-catalog-before-'));
    t.after(() => fs.rm(target, { recursive: true, force: true }));
    await Promise.all(filenames
        .filter((filename) => filename.endsWith('.sql') && filename < boundaryFilename)
        .map((filename) => fs.copyFile(
            path.join(POSTGRES_MIGRATIONS, filename),
            path.join(target, filename)
        )));
    return target;
}
