import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FilesystemCompensationService } from '@/infra/oss/filesystem/compensation-service';
import { FilesystemObjectStorage } from '@/infra/oss/filesystem/object-storage';
import type { ObjectStorage } from '@/ports/object-storage';
import { createWikiFixture, formFields, postForm } from './fixture';

test('Node Wiki delete journals a failed cleanup and the next compensation scan converges', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-wiki-cleanup-'));
    const roots = {
        publicDir: path.join(root, 'public'),
        uploadsDir: path.join(root, 'uploads'),
        chronicleDir: path.join(root, 'chronicle'),
        storyDataDir: path.join(root, 'story-data')
    };
    await Promise.all(Object.values(roots).map((directory) => fs.mkdir(directory, { recursive: true })));
    t.after(() => fs.rm(root, { recursive: true, force: true }));

    const delegate = new FilesystemObjectStorage(roots);
    const compensationDirectory = path.join(root, 'compensation');
    const compensation = new FilesystemCompensationService(compensationDirectory);
    let failDeletes = true;
    let deleteAttempts = 0;
    const storage = new Proxy(delegate, {
        get(target, property, receiver) {
            if (property === 'delete') {
                return async (key: string) => {
                    deleteAttempts += 1;
                    if (failDeletes) throw new Error('injected Wiki object delete failure');
                    return target.delete(key);
                };
            }
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
        }
    }) as ObjectStorage;
    const fixture = createWikiFixture();
    fixture.services.storage = storage;
    fixture.services.compensation = compensation;
    fixture.story.seedStory({
        idol_id: 6,
        category: '测试分类',
        card_name: '【journal】',
        image_file: 'original/journal.webp'
    });
    const key = 'Data/sc/sc_idol/original/journal.webp';
    await delegate.put(key, Uint8Array.of(1, 2, 3), { contentType: 'image/webp' });

    const deletion = await postForm(fixture, '/api/wiki/delete_story', formFields({
        category_name: '测试分类',
        card_name: '【journal】'
    }), await fixture.authHeaders('op'));

    assert.equal(deletion.status, 200);
    assert.deepEqual(await deletion.json(), { status: 'success' });
    assert.equal(fixture.story.stories.length, 0);
    assert.equal(await delegate.exists(key), true);
    assert.equal(deleteAttempts, 1);

    const journalNames = (await fs.readdir(compensationDirectory)).filter((name) => name.endsWith('.json'));
    assert.equal(journalNames.length, 1);
    const journalPath = path.join(compensationDirectory, journalNames[0]!);
    let journal = JSON.parse(await fs.readFile(journalPath, 'utf8')) as {
        kind: string;
        payload: unknown;
        state: string;
        attempts: number;
        lastError?: string;
    };
    assert.deepEqual(journal, {
        ...journal,
        kind: 'delete-object',
        payload: { key },
        state: 'pending',
        attempts: 0,
        lastError: 'injected Wiki object delete failure'
    });

    failDeletes = false;
    const scan = await fixture.app.request('/api/wiki/test');
    assert.equal(scan.status, 200);
    assert.equal(await delegate.exists(key), false);
    assert.equal(deleteAttempts, 2);
    journal = JSON.parse(await fs.readFile(journalPath, 'utf8')) as typeof journal;
    assert.equal(journal.state, 'completed');
    assert.equal(journal.attempts, 1);
    assert.equal(journal.lastError, undefined);
});
