import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FilesystemIdempotencyStore } from
    '@/infra/cache/filesystem/idempotency-store';

test('filesystem idempotency fences a stale owner after lease takeover', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-idempotency-fencing-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const staleOwner = new FilesystemIdempotencyStore(directory);

    const first = await staleOwner.claim('chronicle:approve', 'overlap', 'same-request');
    assert.equal(first.kind, 'acquired');
    if (first.kind !== 'acquired') return;

    const [recordName] = await fs.readdir(directory);
    assert.ok(recordName);
    const recordPath = path.join(directory, recordName);
    const staleRecord = JSON.parse(await fs.readFile(recordPath, 'utf8')) as {
        updatedAt: number;
    };
    staleRecord.updatedAt = Date.now() - 10 * 60 * 1000;
    await fs.writeFile(recordPath, JSON.stringify(staleRecord));

    const replacementOwner = new FilesystemIdempotencyStore(directory);
    const replacement = await replacementOwner.claim(
        'chronicle:approve', 'overlap', 'same-request'
    );
    assert.equal(replacement.kind, 'acquired');
    if (replacement.kind !== 'acquired') return;
    assert.equal(replacement.recovered, true);
    assert.ok(replacement.generation > first.generation);

    await assert.rejects(() => staleOwner.complete(
        'chronicle:approve',
        'overlap',
        'same-request',
        first.generation,
        { status: 200, body: { owner: 'stale' } }
    ), /lease|claim/i);
    await staleOwner.fail(
        'chronicle:approve',
        'overlap',
        'same-request',
        first.generation
    );
    assert.deepEqual(
        await replacementOwner.claim('chronicle:approve', 'overlap', 'same-request'),
        { kind: 'in-progress' }
    );

    await replacementOwner.complete(
        'chronicle:approve',
        'overlap',
        'same-request',
        replacement.generation,
        { status: 200, body: { owner: 'replacement' } }
    );
    assert.deepEqual(
        await replacementOwner.claim('chronicle:approve', 'overlap', 'same-request'),
        {
            kind: 'replay',
            response: { status: 200, body: { owner: 'replacement' } }
        }
    );
});
