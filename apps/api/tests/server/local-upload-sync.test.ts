import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';
import { listLocalUploadFiles, syncLocalUploads } from '@/utils/storage/local-upload-sync';

class MemoryObjectStorage implements ObjectStorage {
    readonly objects = new Map<string, StoredObject>();

    async get(key: string): Promise<StoredObject | null> {
        return this.objects.get(key) || null;
    }

    async put(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject> {
        const stored = {
            body: Uint8Array.from(body),
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: `"${key}"`
        };
        this.objects.set(key, stored);
        return stored;
    }

    async delete(key: string): Promise<void> {
        this.objects.delete(key);
    }

    async exists(key: string): Promise<boolean> {
        return this.objects.has(key);
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = await this.get(sourceKey);
        if (!source) throw new Error('missing source');
        await this.put(destinationKey, source.body, { contentType: source.contentType });
    }

    async move(sourceKey: string, destinationKey: string): Promise<void> {
        await this.copy(sourceKey, destinationKey);
        await this.delete(sourceKey);
    }

    async list(prefix: string): Promise<ListedObject[]> {
        return [...this.objects.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => ({ key, size: value.size, etag: value.etag }));
    }

    async deletePrefix(prefix: string): Promise<void> {
        for (const key of this.objects.keys()) {
            if (key.startsWith(prefix)) this.objects.delete(key);
        }
    }
}

async function fixture(t: TestContext): Promise<string> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-upload-sync-'));
    await fs.mkdir(path.join(directory, 'event/original'), { recursive: true });
    await fs.mkdir(path.join(directory, 'news/thumb'), { recursive: true });
    await fs.writeFile(path.join(directory, 'event/original/activity.png'), 'activity');
    await fs.writeFile(path.join(directory, 'news/thumb/recommendation.jpg'), 'recommendation');
    await fs.writeFile(path.join(directory, '.DS_Store'), 'ignored');
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    return directory;
}

test('local upload sync maps only mutable business media to stable logical keys', async (t) => {
    const directory = await fixture(t);
    const files = await listLocalUploadFiles(directory);
    assert.deepEqual(files.map((file) => path.relative(directory, file)), [
        'event/original/activity.png',
        'news/thumb/recommendation.jpg'
    ]);
});

test('local upload sync is read-only by default, verifies writes, and is idempotent', async (t) => {
    const directory = await fixture(t);
    const storage = new MemoryObjectStorage();

    const audit = await syncLocalUploads(directory, storage, false);
    assert.equal(audit.summary.wouldUpload, 2);
    assert.equal(audit.summary.verified, 0);
    assert.equal(storage.objects.size, 0);

    const applied = await syncLocalUploads(directory, storage, true);
    assert.equal(applied.summary.uploaded, 2);
    assert.equal(applied.summary.verified, 2);
    assert.equal(storage.objects.get(
        'editorial/events/assets/activity/poster.png'
    )?.contentType, 'image/png');

    const repeated = await syncLocalUploads(directory, storage, true);
    assert.equal(repeated.summary.unchanged, 2);
    assert.equal(repeated.summary.uploaded, 0);

    await fs.writeFile(path.join(directory, 'event/original/activity.png'), 'changed');
    const changed = await syncLocalUploads(directory, storage, false);
    assert.equal(changed.summary.wouldReplace, 1);
    const replaced = await syncLocalUploads(directory, storage, true);
    assert.equal(replaced.summary.replaced, 1);
    assert.equal(replaced.summary.verified, 2);
});

test('local upload sync refuses symlinks in the migration source', async (t) => {
    const directory = await fixture(t);
    await fs.symlink(
        path.join(directory, 'event/original/activity.png'),
        path.join(directory, 'event/original/linked.png')
    );
    await assert.rejects(listLocalUploadFiles(directory), /must not contain symlinks/);
});
