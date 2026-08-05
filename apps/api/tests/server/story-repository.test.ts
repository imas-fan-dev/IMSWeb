import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { SqliteConnection } from '@/infra/db/sqlite/connection';
import { SqliteSchemaStrategy } from '@/infra/db/sqlite/schema-strategy';

const DEFAULT_IMAGE_TRANSFORM = {
    fit: 'cover' as const,
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    rotation: 0 as const
};

const DEFAULT_STORY_SOURCE = {
    contentTypeId: 1,
    sourcePlatformId: 2
};

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
    await repository.ensureWikiCategory(1, 1, 'enzaP卡', 'enza_pcard');
    const id = await repository.insertStoryReturningId({
        ...DEFAULT_STORY_SOURCE,
        agencyCode: 'sc',
        idolId: 1,
        category: 'enzaP卡',
        cardName: '【测试卡片】',
        upName: 'fixture-up',
        videoTitle: 'fixture-title',
        url: 'https://example.test/watch',
        subtitle: '第一话',
        imageFile: 'enza_pcard/test.webp',
        imageTransform: {
            fit: 'contain', focalX: 0.25, focalY: 0.75, zoom: 1.5, rotation: 90
        }
    });

    assert.deepEqual(await repository.findStoryById('sc', 1, id), {
        id,
        card_id: 1,
        idol_id: 1,
        category: 'enzaP卡',
        card_name: '【测试卡片】',
        up_name: 'fixture-up',
        video_title: 'fixture-title',
        url: 'https://example.test/watch',
        subtitle: '第一话',
        image_file: 'enza_pcard/test.webp',
        cover_asset_id: null,
        cover_asset_name: null,
        cover_asset_object_key: null,
        cover_asset_revision: null,
        cover_asset_presentation_policy: null,
        image_fit: 'contain',
        image_focal_x: 0.25,
        image_focal_y: 0.75,
        image_zoom: 1.5,
        image_rotation: 90,
        image_media_revision: 0,
        content_type_id: 1,
        content_type_name: '剧情',
        content_type_icon_name: 'book-open-text',
        source_platform_id: 2,
        source_platform_name: '其他来源'
    });
    assert.equal(await repository.findStoryById('sc', 2, id), null);
    assert.equal(await repository.findStoryById('sc', 1, id + 1), null);

    await repository.updateStory({
        ...DEFAULT_STORY_SOURCE,
        id,
        agencyCode: 'sc',
        idolId: 1,
        category: 'enzaP卡',
        cardName: '【测试卡片】',
        upName: 'fixture-up-updated',
        videoTitle: 'fixture-title',
        url: 'https://example.test/watch',
        subtitle: '第一话',
        imageFile: 'enza_pcard/test.webp',
        imageTransform: {
            fit: 'cover', focalX: 0.4, focalY: 0.6, zoom: 2, rotation: 180
        },
        expectedMediaRevision: 0
    });
    const updated = await repository.findStoryById('sc', 1, id);
    assert.equal(updated?.up_name, 'fixture-up-updated');
    assert.equal(updated?.image_zoom, 2);
    assert.equal(updated?.image_rotation, 180);
    assert.equal(updated?.image_media_revision, 1);
    assert.equal(updated?.content_type_icon_name, 'book-open-text');
    assert.deepEqual(await repository.deleteStoryContentType(1), { status: 'in-use' });
    assert.deepEqual(await repository.deleteStorySourcePlatform(2), { status: 'in-use' });

    const column = await repository.createStoryContentType({
        name: '特别节目',
        iconName: 'radio',
        description: '回归测试',
        isActive: true
    });
    assert.equal(column.name, '特别节目');
    assert.deepEqual(await repository.updateStoryContentType(column.id, 0, {
        name: '特别节目',
        iconName: 'podcast',
        description: '暂停新增',
        isActive: false
    }), {
        status: 'saved',
        option: {
            ...column,
            icon_name: 'podcast',
            description: '暂停新增',
            is_active: false,
            revision: 1
        }
    });
    assert.deepEqual(await repository.updateStoryContentType(column.id, 0, {
        name: '过期更新',
        iconName: 'radio',
        description: '',
        isActive: true
    }), { status: 'conflict', revision: 1 });
    assert.deepEqual(await repository.deleteStoryContentType(column.id), {
        status: 'deleted'
    });

    const platform = await repository.createStorySourcePlatform({
        name: '官方站点',
        homepageUrl: 'https://example.test',
        description: '官方发布渠道',
        isActive: true
    });
    assert.equal(platform.homepage_url, 'https://example.test');
    assert.deepEqual(await repository.deleteStorySourcePlatform(platform.id), {
        status: 'deleted'
    });
    await assert.rejects(
        repository.updateStory({
            ...DEFAULT_STORY_SOURCE,
            id,
            agencyCode: 'sc',
            idolId: 1,
            category: 'enzaP卡',
            cardName: '【测试卡片】',
            upName: 'stale',
            videoTitle: 'fixture-title',
            url: 'https://example.test/watch',
            subtitle: '第一话',
            imageFile: 'enza_pcard/test.webp',
            imageTransform: DEFAULT_IMAGE_TRANSFORM,
            expectedMediaRevision: 0
        }),
        (error: Error & { status?: number; revision?: number }) =>
            error.status === 409 && error.revision === 1
    );
});

test('SQLite catalog CRUD supports dynamic agencies and multi-group idols', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-catalog-repository-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();

    const agency = await repository.createWikiAgency({
        code: 'future',
        name: '未来企划',
        color: '#123456',
        bannerTitle: '未来企划',
        wikiEnabled: true
    });
    const fallback = (await repository.listWikiGroups(agency.id)).find((group) =>
        group.is_fallback
    );
    assert.ok(fallback);
    const group = await repository.createWikiGroup({
        agencyId: agency.id,
        code: 'unit-a',
        name: '组合 A',
        color: '#abcdef'
    });
    const idol = await repository.createWikiIdol({
        agencyId: agency.id,
        name: '未来偶像',
        folderName: 'future_idol',
        color: null,
        textColor: '#ffffff',
        wikiUrl: 'https://wiki.example.test/idols/future',
        imageFit: 'cover',
        wikiEnabled: true,
        groupIds: [fallback.id, group.id]
    });
    assert.equal(
        (await repository.findIdolById(idol.id))?.wiki_url,
        'https://wiki.example.test/idols/future'
    );
    assert.deepEqual(
        (await repository.listWikiGroupMembers(agency.id))
            .filter((member) => member.idol_id === idol.id)
            .map((member) => member.group_id),
        [fallback.id, group.id]
    );
    assert.equal((await repository.findAgencyById(agency.id))?.layout_revision, 2);

    const secondIdol = await repository.createWikiIdol({
        agencyId: agency.id,
        name: '未来偶像二号',
        folderName: 'future_idol_two',
        color: '#654321',
        textColor: '#ffffff',
        imageFit: 'cover',
        wikiEnabled: true,
        groupIds: [fallback.id, group.id]
    });
    const membersBeforeMetadataUpdate = await repository.listWikiGroupMembers(agency.id);
    const revisionBeforeMetadataUpdate = (await repository.findAgencyById(agency.id))!
        .layout_revision;
    await repository.updateWikiIdol({
        id: idol.id,
        name: '未来偶像 元数据更新',
        color: '#fedcba',
        textColor: '#111111',
        wikiUrl: 'https://wiki.example.test/idols/future-updated',
        imageFit: 'contain',
        wikiEnabled: true,
        groupIds: [fallback.id, group.id]
    });
    assert.deepEqual(
        await repository.listWikiGroupMembers(agency.id),
        membersBeforeMetadataUpdate
    );
    assert.equal(
        (await repository.findAgencyById(agency.id))?.layout_revision,
        revisionBeforeMetadataUpdate
    );
    assert.equal(
        (await repository.findIdolById(idol.id))?.wiki_url,
        'https://wiki.example.test/idols/future-updated'
    );

    const mediaTransform = {
        fit: 'contain' as const,
        focalX: 0.2,
        focalY: 0.8,
        zoom: 1.75,
        rotation: 270 as const
    };
    assert.deepEqual(await repository.saveAgencyIconMedia({
        id: agency.id,
        expectedRevision: 0,
        objectKey: 'wiki/agencies/future/branding/icon-v1.webp',
        transform: mediaTransform
    }), {
        status: 'saved',
        revision: 1,
        previousObjectKey: null
    });
    assert.deepEqual(await repository.saveWikiGroupIconMedia({
        id: group.id,
        expectedRevision: 0,
        objectKey: 'wiki/agencies/future/groups/unit-a/icon-v1.webp',
        transform: mediaTransform
    }), {
        status: 'saved',
        revision: 1,
        previousObjectKey: null
    });
    assert.deepEqual(await repository.saveIdolAvatarMedia({
        id: idol.id,
        expectedRevision: 0,
        objectKey: 'wiki/agencies/future/idols/future_idol/avatar-v1.webp',
        transform: mediaTransform
    }), {
        status: 'saved',
        revision: 1,
        previousObjectKey: null
    });
    assert.deepEqual(await repository.saveWikiGroupIconMedia({
        id: group.id,
        expectedRevision: 0,
        objectKey: 'stale.webp',
        transform: DEFAULT_IMAGE_TRANSFORM
    }), { status: 'conflict', revision: 1 });
    const storedAgency = await repository.findAgencyById(agency.id);
    assert.equal(storedAgency?.icon_focal_x, 0.2);
    assert.equal(storedAgency?.icon_media_revision, 1);
    const storedGroup = await repository.findWikiGroupById(group.id);
    assert.equal(storedGroup?.icon_rotation, 270);
    assert.equal(storedGroup?.icon_media_revision, 1);
    const storedIdol = await repository.findIdolById(idol.id);
    assert.equal(storedIdol?.avatar_zoom, 1.75);
    assert.equal(storedIdol?.avatar_media_revision, 1);

    await repository.updateWikiIdol({
        id: idol.id,
        name: '未来偶像 改',
        color: '#fedcba',
        textColor: '#111111',
        imageFit: 'contain',
        wikiEnabled: true,
        groupIds: [group.id]
    });
    assert.deepEqual(
        (await repository.listWikiGroupMembers(agency.id))
            .filter((member) => member.idol_id === idol.id)
            .map((member) => member.group_id),
        [group.id]
    );
    assert.deepEqual(
        (await repository.listWikiGroupMembers(agency.id))
            .filter((member) => member.idol_id === secondIdol.id)
            .map((member) => [member.group_id, member.display_order]),
        [[fallback.id, 1], [group.id, 1]]
    );
    assert.equal(
        (await repository.findAgencyById(agency.id))?.layout_revision,
        revisionBeforeMetadataUpdate + 1
    );

    const ungrouped = await repository.createWikiIdol({
        agencyId: agency.id,
        name: '未分组偶像',
        folderName: 'ungrouped_idol',
        color: null,
        textColor: '#ffffff',
        imageFit: 'cover',
        wikiEnabled: true,
        groupIds: []
    });
    assert.deepEqual(
        (await repository.listWikiGroupMembers(agency.id))
            .filter((member) => member.idol_id === ungrouped.id),
        []
    );
    await repository.updateWikiIdol({
        id: idol.id,
        name: '未来偶像 未分组',
        color: '#fedcba',
        textColor: '#111111',
        imageFit: 'contain',
        wikiEnabled: true,
        groupIds: []
    });
    assert.deepEqual(
        (await repository.listWikiGroupMembers(agency.id))
            .filter((member) => member.idol_id === idol.id),
        []
    );
});

test('SQLite group deletion preserves idols and their normalized stories', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-group-delete-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    const agency = await repository.createWikiAgency({
        code: 'future', name: '未来企划', color: '#123456',
        bannerTitle: '未来企划', wikiEnabled: true
    });
    const group = await repository.createWikiGroup({
        agencyId: agency.id, code: 'unit-a', name: '组合 A', color: '#abcdef'
    });
    const idol = await repository.createWikiIdol({
        agencyId: agency.id, name: '未来偶像', folderName: 'future_idol',
        color: null, textColor: '#ffffff', imageFit: 'cover', wikiEnabled: true,
        groupIds: [group.id]
    });
    await repository.ensureWikiCategory(agency.id, idol.id, '主线', 'main');
    await repository.insertStoryReturningId({
        ...DEFAULT_STORY_SOURCE,
        agencyCode: agency.code,
        idolId: idol.id,
        category: '主线',
        cardName: '第一章',
        upName: '来源',
        videoTitle: '第一章',
        url: 'https://example.test/watch',
        subtitle: '',
        imageFile: null,
        imageTransform: DEFAULT_IMAGE_TRANSFORM
    });

    const savedIcon = await repository.saveWikiGroupIconMedia({
        id: group.id,
        expectedRevision: 0,
        objectKey: 'wiki/agencies/future/groups/unit-a/icon-v1.webp',
        transform: DEFAULT_IMAGE_TRANSFORM
    });
    assert.equal(savedIcon.status, 'saved');
    const beforeConflict = await repository.findAgencyById(agency.id);
    assert.deepEqual(await repository.deleteWikiGroup({
        id: group.id,
        expectedRevision: 0
    }), { status: 'conflict', revision: 1 });
    assert.equal(
        (await repository.findAgencyById(agency.id))?.layout_revision,
        beforeConflict?.layout_revision
    );

    const deleted = await repository.deleteWikiGroup({
        id: group.id,
        expectedRevision: 1
    });

    assert.equal(deleted?.status, 'deleted');
    assert.equal(deleted?.status === 'deleted' ? deleted.group.id : null, group.id);
    assert.equal(
        deleted?.status === 'deleted' ? deleted.group.icon_object_key : null,
        'wiki/agencies/future/groups/unit-a/icon-v1.webp'
    );
    assert.equal(await repository.findWikiGroupById(group.id), null);
    assert.ok(await repository.findIdolById(idol.id));
    assert.equal((await repository.listStories(agency.code, idol.id)).length, 1);
    assert.deepEqual(
        (await repository.listWikiGroupMembers(agency.id))
            .filter((member) => member.idol_id === idol.id),
        []
    );
});

test('SQLite normalized stories keep one card and one link per source row', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-normalized-story-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    const agency = await repository.createWikiAgency({
        code: 'future', name: '未来企划', color: '#123456',
        bannerTitle: '未来企划', wikiEnabled: true
    });
    const group = (await repository.listWikiGroups(agency.id))[0]!;
    const idol = await repository.createWikiIdol({
        agencyId: agency.id, name: '未来偶像', folderName: 'future_idol',
        color: null, textColor: '#ffffff', imageFit: 'cover', wikiEnabled: true,
        groupIds: [group.id]
    });
    await repository.ensureWikiCategory(agency.id, idol.id, '主线', 'main');
    const base = {
        ...DEFAULT_STORY_SOURCE,
        agencyCode: agency.code,
        idolId: idol.id,
        category: '主线',
        cardName: '第一章',
        videoTitle: '第一章',
        url: 'https://example.test/watch',
        subtitle: '全话',
        imageFile: 'main/first.webp',
        imageTransform: DEFAULT_IMAGE_TRANSFORM
    };
    const firstId = await repository.insertStoryReturningId({ ...base, upName: '来源一' });
    const secondId = await repository.insertStoryReturningId({ ...base, upName: '来源二' });
    assert.notEqual(firstId, secondId);
    assert.equal((await repository.listStories(agency.code, idol.id)).length, 2);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_cards'
    ))?.count, 1);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_links'
    ))?.count, 2);

    const batchIds = await repository.insertStoryBatchReturningIds({
        ...base,
        cardName: '批量卡片',
        imageFile: 'main/batch.webp',
        links: [
            { ...DEFAULT_STORY_SOURCE, upName: '批量来源一', videoTitle: '视角一', url: 'https://example.test/one' },
            { ...DEFAULT_STORY_SOURCE, upName: '批量来源二', videoTitle: '视角二', url: 'https://example.test/two' }
        ]
    });
    assert.equal(batchIds.length, 2);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_cards'
    ))?.count, 2);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_links'
    ))?.count, 4);
    const firstBatchDelete = await repository.deleteStoryLink({
        agencyCode: agency.code,
        idolId: idol.id,
        id: batchIds[0]!,
        expectedRevision: 0
    });
    assert.equal(firstBatchDelete?.status, 'deleted');
    assert.equal(
        firstBatchDelete?.status === 'deleted' ? firstBatchDelete.cardDeleted : null,
        false
    );
    const lastBatchDelete = await repository.deleteStoryLink({
        agencyCode: agency.code,
        idolId: idol.id,
        id: batchIds[1]!,
        expectedRevision: 0
    });
    assert.equal(
        lastBatchDelete?.status === 'deleted' ? lastBatchDelete.cardDeleted : null,
        false
    );
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_cards'
    ))?.count, 2);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_links'
    ))?.count, 2);
    assert.ok((await repository.listStoryCards(agency.code, idol.id)).some((card) =>
        card.card_name === '批量卡片'
    ));

    await database.executeScript(`
        CREATE TRIGGER reject_batch_second_source
        BEFORE INSERT ON wiki_story_links
        WHEN NEW.url = 'https://example.test/reject-batch'
        BEGIN
            SELECT RAISE(ABORT, 'injected batch source failure');
        END;
    `);
    await assert.rejects(repository.insertStoryBatchReturningIds({
        ...base,
        cardName: '事务回滚卡片',
        imageFile: null,
        links: [
            { ...DEFAULT_STORY_SOURCE, upName: '合法来源', videoTitle: '合法标题', url: 'https://example.test/valid' },
            {
                ...DEFAULT_STORY_SOURCE,
                upName: '失败来源',
                videoTitle: '失败标题',
                url: 'https://example.test/reject-batch'
            }
        ]
    }));
    await database.executeScript('DROP TRIGGER reject_batch_second_source;');
    assert.equal(
        (await repository.listStories(agency.code, idol.id))
            .filter((story) => story.card_name === '事务回滚卡片').length,
        0
    );

    await database.run('PRAGMA busy_timeout=5000');
    const concurrentDatabase = new SqliteConnection(path.join(root, 'story.sqlite'));
    await concurrentDatabase.run('PRAGMA busy_timeout=5000');
    const concurrentRepository = new SqlStoryRepository(
        concurrentDatabase,
        new SqliteSchemaStrategy()
    );
    try {
        const contenders = await Promise.allSettled([
            repository.insertStoryReturningId({
                ...base,
                cardName: '第二章',
                imageFile: 'main/second-a.webp',
                upName: '并发来源一'
            }),
            concurrentRepository.insertStoryReturningId({
                ...base,
                cardName: '第二章',
                imageFile: 'main/second-b.webp',
                upName: '并发来源二'
            })
        ]);
        assert.equal(contenders.filter((result) => result.status === 'fulfilled').length, 1);
        const rejected = contenders.find((result) => result.status === 'rejected');
        assert.ok(rejected && rejected.status === 'rejected');
        assert.equal((rejected.reason as Error & { status?: number }).status, 409);
    } finally {
        await concurrentRepository.close();
    }
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_cards'
    ))?.count, 3);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_links'
    ))?.count, 3);
    assert.equal(
        (await repository.listStories(agency.code, idol.id))
            .filter((story) => story.card_name === '第二章').length,
        1
    );
    assert.deepEqual(await repository.insertStoryBatchReturningIds({
        ...base,
        cardName: '待补来源',
        imageFile: null,
        links: []
    }), []);
    assert.ok((await repository.listStoryCards(agency.code, idol.id)).some((card) =>
        card.card_name === '待补来源'
    ));
    assert.equal(
        (await repository.listStories(agency.code, idol.id))
            .filter((story) => story.card_name === '待补来源').length,
        0
    );
});

test('SQLite card source append requires the exact card and current media revision', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-card-source-append-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    const agency = await repository.createWikiAgency({
        code: 'future', name: '未来企划', color: '#123456',
        bannerTitle: '未来企划', wikiEnabled: true
    });
    const idol = await repository.createWikiIdol({
        agencyId: agency.id, name: '未来偶像', folderName: 'future_idol',
        color: null, textColor: '#ffffff', imageFit: 'cover', wikiEnabled: true,
        groupIds: []
    });
    await repository.ensureWikiCategory(agency.id, idol.id, '主线', 'main');
    const firstId = await repository.insertStoryReturningId({
        ...DEFAULT_STORY_SOURCE,
        agencyCode: agency.code,
        idolId: idol.id,
        category: '主线',
        cardName: '第一章',
        upName: '初始来源',
        videoTitle: '初始标题',
        url: 'https://example.test/initial',
        subtitle: '',
        imageFile: 'main/current.webp',
        imageTransform: DEFAULT_IMAGE_TRANSFORM
    });
    const card = await repository.findStoryById(agency.code, idol.id, firstId);
    assert.ok(card);

    const added = await repository.addStoryCardSources({
        agencyCode: agency.code,
        idolId: idol.id,
        cardId: card.card_id,
        expectedRevision: 0,
        links: [
            { ...DEFAULT_STORY_SOURCE, upName: '来源一', videoTitle: '标题一', url: 'https://example.test/one' },
            { ...DEFAULT_STORY_SOURCE, upName: '来源二', videoTitle: '标题二', url: 'https://example.test/two' }
        ]
    });
    assert.equal(added.status, 'added');
    assert.equal(added.status === 'added' ? added.ids.length : 0, 2);
    assert.equal((await repository.listStories(agency.code, idol.id)).length, 3);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_cards'
    ))?.count, 1);

    await repository.setStoryImage(agency.code, firstId, 'main/replaced.webp');
    assert.deepEqual(await repository.addStoryCardSources({
        agencyCode: agency.code,
        idolId: idol.id,
        cardId: card.card_id,
        expectedRevision: 0,
        links: [{ ...DEFAULT_STORY_SOURCE, upName: '过期来源', videoTitle: '过期', url: 'https://example.test/stale' }]
    }), { status: 'conflict', revision: 1 });
    await assert.rejects(repository.addStoryCardSources({
        agencyCode: agency.code,
        idolId: idol.id,
        cardId: card.card_id + 999,
        expectedRevision: 0,
        links: [{ ...DEFAULT_STORY_SOURCE, upName: '无效来源', videoTitle: '无效', url: 'https://example.test/missing' }]
    }), (error: Error & { status?: number }) => error.status === 404);
    assert.equal((await repository.listStories(agency.code, idol.id)).length, 3);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_cards'
    ))?.count, 1);
});

test('SQLite idol deletion preserves rows while hiding the idol and its stories', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-idol-soft-delete-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    const agency = await repository.createWikiAgency({
        code: 'soft-delete', name: '软删除企划', color: '#123456',
        bannerTitle: '软删除企划', wikiEnabled: true
    });
    const idol = await repository.createWikiIdol({
        agencyId: agency.id, name: '保留记录偶像', folderName: 'retained_idol',
        color: null, textColor: '#ffffff', imageFit: 'cover', wikiEnabled: true,
        groupIds: []
    });
    await repository.setIdolAvatarObjectKey(
        idol.id,
        'wiki/agencies/soft-delete/idols/retained_idol/avatar.webp'
    );
    await repository.ensureWikiCategory(agency.id, idol.id, '主线', 'main');
    await repository.insertStoryBatchReturningIds({
        agencyCode: agency.code,
        idolId: idol.id,
        category: '主线',
        cardName: '第一章',
        subtitle: '',
        imageFile: 'main/first.webp',
        imageTransform: DEFAULT_IMAGE_TRANSFORM,
        links: [
            { ...DEFAULT_STORY_SOURCE, upName: '来源一', videoTitle: '视角一', url: 'https://example.test/one' },
            { ...DEFAULT_STORY_SOURCE, upName: '来源二', videoTitle: '视角二', url: 'https://example.test/two' }
        ]
    });
    await repository.insertStoryReturningId({
        ...DEFAULT_STORY_SOURCE,
        agencyCode: agency.code,
        idolId: idol.id,
        category: '主线',
        cardName: '第二章',
        upName: '来源三',
        videoTitle: '视角三',
        url: 'https://example.test/three',
        subtitle: '',
        imageFile: null,
        imageTransform: DEFAULT_IMAGE_TRANSFORM
    });

    assert.deepEqual(await repository.deleteWikiIdol({
        id: idol.id,
        expectedRevision: 0
    }), { status: 'conflict', revision: 1 });
    const deleted = await repository.deleteWikiIdol({
        id: idol.id,
        expectedRevision: 1
    });
    assert.equal(deleted?.status, 'deleted');
    assert.equal(deleted?.status === 'deleted' ? deleted.cardCount : null, 2);
    assert.equal(deleted?.status === 'deleted' ? deleted.storyCount : null, 3);

    assert.equal(await repository.findIdolById(idol.id), null);
    assert.ok(!(await repository.listIdolsWithAgencies()).some(
        (candidate) => candidate.id === idol.id
    ));
    assert.deepEqual(await repository.listStories(agency.code, idol.id), []);
    assert.deepEqual(await repository.listWikiCategories(agency.id, idol.id), []);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM idols WHERE id=? AND deleted_at IS NOT NULL',
        [idol.id]
    ))?.count, 1);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_cards WHERE idol_id=?',
        [idol.id]
    ))?.count, 2);
    assert.equal((await database.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM wiki_story_cards
         WHERE idol_id=? AND deleted_at IS NOT NULL`,
        [idol.id]
    ))?.count, 2);
    assert.equal((await database.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM wiki_story_links WHERE deleted_at IS NOT NULL'
    ))?.count, 3);
    assert.equal((await database.get<{ avatar_object_key: string | null }>(
        'SELECT avatar_object_key FROM idols WHERE id=?',
        [idol.id]
    ))?.avatar_object_key,
    'wiki/agencies/soft-delete/idols/retained_idol/avatar.webp');
    assert.equal(await repository.deleteWikiIdol({
        id: idol.id,
        expectedRevision: 1
    }), null);
});

test('SQLite category rename is scoped by idol assignment and preserves storage slug', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-category-rename-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    const agency = await repository.createWikiAgency({
        code: 'future', name: '未来企划', color: '#123456',
        bannerTitle: '未来企划', wikiEnabled: true
    });
    const firstIdol = await repository.createWikiIdol({
        agencyId: agency.id, name: '偶像一', folderName: 'idol_one', color: null,
        textColor: '#ffffff', imageFit: 'cover', wikiEnabled: true, groupIds: []
    });
    const secondIdol = await repository.createWikiIdol({
        agencyId: agency.id, name: '偶像二', folderName: 'idol_two', color: null,
        textColor: '#ffffff', imageFit: 'cover', wikiEnabled: true, groupIds: []
    });
    const category = await repository.ensureWikiCategory(
        agency.id,
        firstIdol.id,
        '共同分类',
        'stable_storage_slug'
    );
    const shared = await repository.ensureWikiCategory(
        agency.id,
        secondIdol.id,
        '共同分类',
        'ignored_slug'
    );
    assert.equal(shared.id, category.id);

    const updated = await repository.updateWikiCategory({
        agencyId: agency.id,
        idolId: firstIdol.id,
        id: category.id,
        name: '已改名分类',
        expectedName: '共同分类'
    });

    assert.equal(updated?.status, 'saved');
    assert.equal(updated?.status === 'saved' ? updated.category.name : null, '已改名分类');
    assert.equal(
        updated?.status === 'saved' ? updated.category.storage_slug : null,
        'stable_storage_slug'
    );
    assert.deepEqual(
        (await repository.listWikiCategories(agency.id, secondIdol.id))
            .map(({ name, storage_slug }) => ({ name, storage_slug })),
        [{ name: '已改名分类', storage_slug: 'stable_storage_slug' }]
    );
    assert.deepEqual(await repository.updateWikiCategory({
        agencyId: agency.id,
        idolId: firstIdol.id,
        id: category.id,
        name: '过期改名',
        expectedName: '共同分类'
    }), { status: 'conflict', currentName: '已改名分类' });
    assert.deepEqual(
        (await repository.listWikiCategories(agency.id, firstIdol.id))
            .map(({ name, storage_slug }) => ({ name, storage_slug })),
        [{ name: '已改名分类', storage_slug: 'stable_storage_slug' }]
    );
    assert.equal(await repository.updateWikiCategory({
        agencyId: agency.id,
        idolId: 9999,
        id: category.id,
        name: '越权改名',
        expectedName: '已改名分类'
    }), null);
});

test('SQLite card edit updates shared card metadata without modifying source links', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-card-edit-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    const agency = await repository.createWikiAgency({
        code: 'future', name: '未来企划', color: '#123456',
        bannerTitle: '未来企划', wikiEnabled: true
    });
    const idol = await repository.createWikiIdol({
        agencyId: agency.id, name: '未来偶像', folderName: 'future_idol', color: null,
        textColor: '#ffffff', imageFit: 'cover', wikiEnabled: true, groupIds: []
    });
    await repository.ensureWikiCategory(agency.id, idol.id, '旧分类', 'old');
    const targetCategory = await repository.ensureWikiCategory(
        agency.id,
        idol.id,
        '新分类',
        'new'
    );
    const ids = await repository.insertStoryBatchReturningIds({
        agencyCode: agency.code,
        idolId: idol.id,
        category: '旧分类',
        cardName: '旧卡片',
        subtitle: '旧副标题',
        imageFile: 'old/original.webp',
        imageTransform: DEFAULT_IMAGE_TRANSFORM,
        links: [
            { ...DEFAULT_STORY_SOURCE, upName: '来源一', videoTitle: '标题一', url: 'https://example.test/one' },
            { ...DEFAULT_STORY_SOURCE, upName: '来源二', videoTitle: '标题二', url: 'https://example.test/two' }
        ]
    });
    const original = await repository.findStoryById(agency.code, idol.id, ids[0]!);
    assert.ok(original);

    assert.deepEqual(await repository.updateStoryCard({
        agencyCode: agency.code,
        idolId: idol.id,
        id: original.card_id,
        categoryId: targetCategory.id,
        cardName: '新卡片',
        subtitle: '新副标题',
        imageFile: 'new/replacement.webp',
        imageTransform: {
            fit: 'contain', focalX: 0.25, focalY: 0.75, zoom: 1.5, rotation: 90
        },
        expectedRevision: 0
    }), { status: 'saved', revision: 1 });
    assert.deepEqual(
        (await repository.listStories(agency.code, idol.id)).map((story) => ({
            id: story.id,
            upName: story.up_name,
            videoTitle: story.video_title,
            url: story.url,
            category: story.category,
            cardName: story.card_name,
            revision: story.image_media_revision
        })),
        [
            {
                id: ids[0], upName: '来源一', videoTitle: '标题一',
                url: 'https://example.test/one', category: '新分类',
                cardName: '新卡片', revision: 1
            },
            {
                id: ids[1], upName: '来源二', videoTitle: '标题二',
                url: 'https://example.test/two', category: '新分类',
                cardName: '新卡片', revision: 1
            }
        ]
    );
    assert.deepEqual(await repository.updateStoryCard({
        agencyCode: agency.code,
        idolId: idol.id,
        id: original.card_id,
        categoryId: targetCategory.id,
        cardName: '过期写入',
        subtitle: '',
        imageFile: null,
        imageTransform: DEFAULT_IMAGE_TRANSFORM,
        expectedRevision: 0
    }), { status: 'conflict', revision: 1 });
    assert.equal(await repository.findStoryCardById(
        agency.code,
        idol.id + 1,
        original.card_id
    ), null);
});

test('SQLite story cover assets are agency scoped, versioned, and protected in use', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-cover-assets-'));
    const database = new SqliteConnection(path.join(root, 'story.sqlite'));
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    t.after(async () => {
        await repository.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await repository.initialize();
    const agency = await repository.createWikiAgency({
        code: 'shared', name: '共享素材企划', color: '#123456',
        bannerTitle: '共享素材企划', wikiEnabled: true
    });
    const idol = await repository.createWikiIdol({
        agencyId: agency.id, name: '素材偶像', folderName: 'asset_idol', color: null,
        textColor: '#ffffff', imageFit: 'cover', wikiEnabled: true, groupIds: []
    });
    const category = await repository.ensureWikiCategory(
        agency.id,
        idol.id,
        '共用封面',
        'shared-cover'
    );
    const asset = await repository.createStoryCoverAsset({
        agencyId: agency.id,
        name: '通用主线封面',
        objectKey: 'wiki/agencies/shared/story-cover-assets/one.webp',
        presentationPolicy: 'contain'
    });
    assert.equal(asset.presentation_policy, 'contain');
    const [storyId] = await repository.insertStoryBatchReturningIds({
        agencyCode: agency.code,
        idolId: idol.id,
        category: category.name,
        cardName: '【共享卡片】',
        subtitle: '',
        imageFile: null,
        coverAssetId: asset.id,
        imageTransform: DEFAULT_IMAGE_TRANSFORM,
        links: [{
            ...DEFAULT_STORY_SOURCE,
            upName: '来源',
            videoTitle: '标题',
            url: 'https://example.test/shared'
        }]
    });
    const story = await repository.findStoryById(agency.code, idol.id, storyId!);
    assert.equal(story?.cover_asset_id, asset.id);
    assert.equal(story?.cover_asset_name, '通用主线封面');
    assert.equal(story?.cover_asset_object_key, asset.object_key);
    assert.equal(story?.cover_asset_presentation_policy, 'contain');
    assert.equal((await repository.listStoryCoverAssets(agency.id))[0]?.usage_count, 1);
    await database.prepare(
        'UPDATE wiki_categories SET background_eligible=TRUE WHERE id=?'
    ).bind(category.id).run();
    assert.equal(await repository.sampleWikiBackground(), null);
    assert.deepEqual(await repository.deleteStoryCoverAsset(asset.id), {
        status: 'in-use',
        usageCount: 1
    });

    const updatedAsset = await repository.updateStoryCoverAsset({
        id: asset.id,
        agencyId: agency.id,
        name: '通用主线封面改',
        objectKey: 'wiki/agencies/shared/story-cover-assets/two.webp',
        presentationPolicy: 'inherit',
        isActive: false,
        expectedRevision: 0
    });
    assert.equal(updatedAsset?.status, 'saved');
    assert.equal(
        (await repository.findStoryCoverAssetById(asset.id))?.presentation_policy,
        'inherit'
    );
    assert.equal(
        (await repository.findStoryById(agency.code, idol.id, storyId!))
            ?.cover_asset_presentation_policy,
        'inherit'
    );
    assert.equal((await repository.sampleWikiBackground())?.card_id, story?.card_id);
    assert.deepEqual(await repository.updateStoryCard({
        agencyCode: agency.code,
        idolId: idol.id,
        id: story!.card_id,
        categoryId: category.id,
        cardName: story!.card_name,
        subtitle: '',
        imageFile: null,
        coverAssetId: null,
        imageTransform: DEFAULT_IMAGE_TRANSFORM,
        expectedRevision: 0
    }), { status: 'saved', revision: 1 });
    assert.deepEqual(await repository.deleteStoryCoverAsset(asset.id), {
        status: 'deleted',
        objectKey: 'wiki/agencies/shared/story-cover-assets/two.webp'
    });
});

test('SQLite legacy story IDs survive backfill and new IDs start above them', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-story-id-backfill-'));
    const filename = path.join(root, 'story.sqlite');
    t.after(async () => fs.rm(root, { recursive: true, force: true }));

    const source = new SqliteConnection(filename);
    await new SqliteSchemaStrategy().initializeStory(source);
    await source.executeScript(`
        DROP TABLE wiki_story_links;
        DROP TABLE wiki_story_cards;
    `);
    await source.run(
        'INSERT INTO agencies (id, code, name_cn, color) VALUES (?, ?, ?, ?)',
        [1, 'sc', '闪耀色彩', '#123456']
    );
    await source.run(
        `INSERT INTO idols (id, agency_id, name_cn, folder_name, color)
         VALUES (?, ?, ?, ?, ?)`,
        [1, 1, '未来偶像', 'future_idol', '#abcdef']
    );
    await source.run(
        `INSERT INTO sc_stories
            (id, idol_id, category, card_name, up_name, video_title, url,
             subtitle, image_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [500, 1, '主线', '第一章', '旧来源', '旧标题', 'https://example.test/legacy',
            '旧副标题', 'legacy/first.webp',
            501, 1, '主线', '第一章', '另一来源', '另一标题',
            'https://example.test/legacy-variant', '另一副标题', 'legacy/second.webp']
    );
    await source.close();

    const database = new SqliteConnection(filename);
    const repository = new SqlStoryRepository(database, new SqliteSchemaStrategy());
    await repository.initialize();
    t.after(async () => repository.close());
    assert.deepEqual(await repository.listStories('sc', 1), [
        {
            id: 500,
            card_id: 1,
            idol_id: 1,
            category: '主线',
            card_name: '第一章',
            up_name: '旧来源',
            video_title: '旧标题',
            url: 'https://example.test/legacy',
            subtitle: '旧副标题',
            image_file: 'legacy/first.webp',
            cover_asset_id: null,
            cover_asset_name: null,
            cover_asset_object_key: null,
            cover_asset_revision: null,
            cover_asset_presentation_policy: null,
            image_fit: 'cover',
            image_focal_x: 0.5,
            image_focal_y: 0.5,
            image_zoom: 1,
            image_rotation: 0,
            image_media_revision: 0,
            content_type_id: 1,
            content_type_name: '剧情',
            content_type_icon_name: 'book-open-text',
            source_platform_id: 2,
            source_platform_name: '其他来源'
        },
        {
            id: 501,
            card_id: 1,
            idol_id: 1,
            category: '主线',
            card_name: '第一章',
            up_name: '另一来源',
            video_title: '另一标题',
            url: 'https://example.test/legacy-variant',
            subtitle: '旧副标题',
            image_file: 'legacy/first.webp',
            cover_asset_id: null,
            cover_asset_name: null,
            cover_asset_object_key: null,
            cover_asset_revision: null,
            cover_asset_presentation_policy: null,
            image_fit: 'cover',
            image_focal_x: 0.5,
            image_focal_y: 0.5,
            image_zoom: 1,
            image_rotation: 0,
            image_media_revision: 0,
            content_type_id: 1,
            content_type_name: '剧情',
            content_type_icon_name: 'book-open-text',
            source_platform_id: 2,
            source_platform_name: '其他来源'
        }
    ]);
    const preserved = await database.get<{
        legacy_subtitle: string;
        legacy_image_file: string;
    }>(
        `SELECT legacy_subtitle, legacy_image_file
         FROM wiki_story_links WHERE legacy_table='sc_stories' AND legacy_id=501`
    );
    assert.deepEqual(preserved, {
        legacy_subtitle: '另一副标题',
        legacy_image_file: 'legacy/second.webp'
    });
    await repository.setStoryImage('sc', 500, 'runtime/current.webp');
    assert.deepEqual(
        (await repository.listStoryGroupForDelete('sc', 1, '主线', '第一章'))
            .map((story) => story.image_file)
            .sort(),
        ['legacy/first.webp', 'legacy/second.webp', 'runtime/current.webp']
    );
    assert.deepEqual(
        (await repository.listCategoryImages('sc', 1, '主线'))
            .map(({ image_file }) => image_file)
            .sort(),
        ['legacy/first.webp', 'legacy/second.webp', 'runtime/current.webp']
    );
    assert.deepEqual(await repository.deleteStoryLink({
        agencyCode: 'sc',
        idolId: 1,
        id: 501,
        expectedRevision: 0
    }), { status: 'conflict', revision: 1 });
    assert.deepEqual(await repository.deleteStoryLink({
        agencyCode: 'sc',
        idolId: 1,
        id: 501,
        expectedRevision: 1
    }), {
        status: 'deleted',
        cardDeleted: false,
        revision: 1,
        cleanupImageFiles: ['legacy/second.webp']
    });
    assert.deepEqual(await repository.deleteStoryLink({
        agencyCode: 'sc',
        idolId: 1,
        id: 500,
        expectedRevision: 1
    }), {
        status: 'deleted',
        cardDeleted: false,
        revision: 1,
        cleanupImageFiles: ['legacy/first.webp']
    });
    assert.ok(await repository.findStoryCardById('sc', 1, 1));

    const id = await repository.insertStoryReturningId({
        ...DEFAULT_STORY_SOURCE,
        agencyCode: 'sc',
        idolId: 1,
        category: '主线',
        cardName: '第二章',
        upName: '新来源',
        videoTitle: '新标题',
        url: 'https://example.test/runtime',
        subtitle: '',
        imageFile: null,
        imageTransform: DEFAULT_IMAGE_TRANSFORM
    });
    assert.ok(id > 501);
    assert.equal((await repository.findStoryById('sc', 1, id))?.up_name, '新来源');

    const replacementGroup = await repository.createWikiGroup({
        agencyId: 1,
        code: 'replacement',
        name: '新组合',
        color: '#654321'
    });
    await repository.updateWikiIdol({
        id: 1,
        name: '未来偶像',
        color: '#abcdef',
        textColor: '#ffffff',
        imageFit: 'cover',
        wikiEnabled: true,
        groupIds: [replacementGroup.id]
    });
    await repository.deleteStoryGroup('sc', 1, '主线', '第一章');
    await repository.close();

    const reopenedDatabase = new SqliteConnection(filename);
    const reopened = new SqlStoryRepository(reopenedDatabase, new SqliteSchemaStrategy());
    await reopened.initialize();
    t.after(async () => reopened.close());
    assert.deepEqual(
        (await reopened.listStories('sc', 1)).map((story) => story.card_name),
        ['第二章']
    );
    assert.deepEqual(
        (await reopened.listWikiGroupMembers(1)).map((member) => member.group_id),
        [replacementGroup.id]
    );
});
