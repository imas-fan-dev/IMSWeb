import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { SqliteConnection } from '@/infra/db/sqlite/connection';
import { SqliteSchemaStrategy } from '@/infra/db/sqlite/schema-strategy';

test('SQLite story lookup selects the requested row within its agency and idol', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-story-repository-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    await database.run(
        'INSERT INTO agencies (id, code, name_cn, color) VALUES (?, ?, ?, ?)',
        [1, 'sc', '闪耀色彩', '#8dbbff']
    );
    await database.run(
        `INSERT INTO idols (id, agency_id, name_cn, folder_name, color)
         VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
        [1, 1, '樱木真乃', 'sakuragi_mano', '#ffbad6',
            2, 1, '风野灯织', 'kazano_hiori', '#144384']
    );
    const id = await repository.insertStoryReturningId({
        agencyCode: 'sc',
        idolId: 1,
        category: 'enzaP卡',
        cardName: '【测试卡片】',
        upName: 'fixture-up',
        videoTitle: 'fixture-title',
        url: 'https://example.test/watch',
        subtitle: '第一话',
        imageFile: 'enza_pcard/test.webp'
    });

    assert.deepEqual(await repository.findStoryById('sc', 1, id), {
        id,
        idol_id: 1,
        category: 'enzaP卡',
        card_name: '【测试卡片】',
        up_name: 'fixture-up',
        video_title: 'fixture-title',
        url: 'https://example.test/watch',
        subtitle: '第一话',
        image_file: 'enza_pcard/test.webp'
    });
    assert.equal(await repository.findStoryById('sc', 2, id), null);
    assert.equal(await repository.findStoryById('sc', 1, id + 1), null);
});
