import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const POSTGRES_MIGRATIONS = path.resolve(__dirname, '../../migrations/postgresql');

// The cleanup registration is passed in by the caller so this module stays
// runner-neutral: call sites hand it `onTestFinished` rather than importing the
// runner here. It may not import a runner entry point directly, because its
// callers own the lifecycle.
export async function createMigrationCatalogBefore(
    registerCleanup: (cleanup: () => void | Promise<void>) => void,
    boundaryFilename: string
): Promise<string> {
    const filenames = await fs.readdir(POSTGRES_MIGRATIONS);
    if (!filenames.includes(boundaryFilename)) {
        throw new Error(`PostgreSQL migration boundary not found: ${boundaryFilename}`);
    }

    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-pg-catalog-before-'));
    registerCleanup(() => fs.rm(target, { recursive: true, force: true }));
    await Promise.all(filenames
        .filter((filename) => filename.endsWith('.sql') && filename < boundaryFilename)
        .map((filename) => fs.copyFile(
            path.join(POSTGRES_MIGRATIONS, filename),
            path.join(target, filename)
        )));
    return target;
}
