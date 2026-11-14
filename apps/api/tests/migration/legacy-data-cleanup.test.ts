import { afterAll, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client } from 'pg';
import { cleanupLegacyData } from '../../scripts/migration/legacy-data-cleanup';
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled,
} from '../integration/postgres-harness';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle';

afterAll(() => closeSharedPostgresTestAllocator());

test.skipIf(!postgresIntegrationEnabled())(
    'cleanup backs up, reconciles, deletes only legacy rows, and is repeatable',
    async () => {
        const harness = await createPostgresTestHarness({
            label: 'legacy_cleanup',
        });
        const client = new Client({ connectionString: harness.databaseUrl });
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'ims-cleanup-backup-'),
        );
        try {
            await client.connect();
            const project = (
                await client.query("SELECT id FROM projects WHERE code='cg'")
            ).rows[0].id;
            const entry = (
                await client.query(
                    "INSERT INTO idols(agency_id,name_cn,folder_name) VALUES ($1,'清理测试','cleanup_test') RETURNING id",
                    [project],
                )
            ).rows[0].id;
            const category = (
                await client.query(
                    "INSERT INTO wiki_categories(agency_id,name,storage_slug) VALUES ($1,'清理分类','cleanup_category') RETURNING id",
                    [project],
                )
            ).rows[0].id;
            await client.query(
                'INSERT INTO wiki_entry_categories(project_id,entry_id,category_id,display_order,show_when_empty) VALUES ($1,$2,$3,0,true)',
                [project, entry, category],
            );
            const card = (
                await client.query(
                    "INSERT INTO wiki_story_cards(agency_id,idol_id,category_id,card_name,subtitle,image_file,display_order) VALUES ($1,$2,$3,'测试卡','原字幕','old.webp',0) RETURNING id",
                    [project, entry, category],
                )
            ).rows[0].id;
            await client.query(
                "INSERT INTO cg_stories(id,idol_id,category,card_name,up_name,video_title,url,subtitle,image_file) VALUES (101,$1,'清理分类','测试卡','作者','视频','https://example.test/story','原字幕','old.webp')",
                [entry],
            );
            await client.query(
                "INSERT INTO wiki_story_links(agency_id,card_id,up_name,video_title,url,display_order,legacy_table,legacy_id,legacy_subtitle,legacy_image_file,content_type_id,source_platform_id) VALUES ($1,$2,'作者','视频','https://example.test/story',0,'cg_stories',101,'原字幕','old.webp',1,2)",
                [project, card],
            );
            const config = {
                connectionString: harness.databaseUrl,
                confirmTargetDatabase: new URL(
                    harness.databaseUrl,
                ).pathname.slice(1),
                backupDirectory: directory,
            };
            const character = (
                await client.query(
                    "INSERT INTO namecard_characters(agency_id,name_cn) VALUES ($1,'旧担当测试') RETURNING id",
                    [project],
                )
            ).rows[0].id;
            // Test input only: reopen the single archive guard inside a transaction,
            // then restore it before invoking the independent cleanup connection.
            await client.query('BEGIN');
            await client.query(
                'ALTER TABLE cards DISABLE TRIGGER cards_read_only',
            );
            const archived = (
                await client.query(
                    "INSERT INTO cards(image1_url,image2_url,submission_kind) VALUES ('front.png','back.png','legacy') RETURNING id",
                )
            ).rows[0].id;
            await client.query(
                'ALTER TABLE cards ENABLE TRIGGER cards_read_only',
            );
            await client.query('COMMIT');
            const canonical = (
                await client.query(
                    "INSERT INTO fudaba_cards(id,card_number,legacy_card_id,origin,producer_name,exchange_mode,trade_note,created_at,updated_at) VALUES ('cleanup-legacy',$1,$1,'legacy',NULL,'none',NULL,now(),now()) RETURNING id",
                    [archived],
                )
            ).rows[0].id;
            await client.query(
                'INSERT INTO namecard_favorite_characters(card_id,character_id,display_order) VALUES ($1,$2,0)',
                [archived, character],
            );
            await client.query(
                'INSERT INTO fudaba_card_favorite_characters(card_id,character_id,display_order) VALUES ($1,$2,0)',
                [canonical, character],
            );
        const dry = await cleanupLegacyData(config);
        await expect(cleanupLegacyData({ ...config,connectionString: '' })).rejects.toThrow(/explicit PostgreSQL/);
            expect(dry.applied).toBe(false);
            expect(dry.plan.stories.cg_stories.keys).toEqual(['101']);
            expect(await fs.readdir(directory)).toEqual([]);
            const ledger = (
                await client.query(
                    'SELECT version,checksum FROM ims_schema_migrations ORDER BY version DESC LIMIT 1',
                )
            ).rows[0];
            await client.query(
                'UPDATE ims_schema_migrations SET checksum=$1 WHERE version=$2',
                ['0'.repeat(64), ledger.version],
            );
            await expect(
                cleanupLegacyData({ ...config, apply: true }),
            ).rejects.toThrow(/complete current migration catalog/);
            await client.query(
                'UPDATE ims_schema_migrations SET checksum=$1 WHERE version=$2',
                [ledger.checksum, ledger.version],
            );
            expect(
                (
                    await client.query(
                        'SELECT count(*)::int AS count FROM cg_stories',
                    )
                ).rows[0].count,
            ).toBe(1);
            await expect(
                cleanupLegacyData({
                    ...config,
                    apply: true,
                    confirmTargetDatabase: 'wrong',
                }),
            ).rejects.toThrow(/actual database/);
            await client.query(
                "UPDATE wiki_story_links SET url='https://example.test/edited' WHERE legacy_table='cg_stories' AND legacy_id=101",
            );
            await expect(
                cleanupLegacyData({ ...config, apply: true }),
            ).rejects.toThrow(/not exactly reconciled/);
            expect(
                (
                    await client.query(
                        'SELECT count(*)::int AS count FROM cg_stories',
                    )
                ).rows[0].count,
            ).toBe(1);
            await client.query(
                "UPDATE wiki_story_links SET url='https://example.test/story' WHERE legacy_table='cg_stories' AND legacy_id=101",
            );
            const before = (
                await client.query('SELECT * FROM wiki_story_links ORDER BY id')
            ).rows;
            const applied = await cleanupLegacyData({ ...config, apply: true });
            expect(applied.deleted.cg_stories).toBe(1);
            expect(applied.deleted.namecard_favorite_characters).toBe(1);
            expect(
                (
                    await client.query(
                        'SELECT character_id FROM fudaba_card_favorite_characters WHERE card_id=$1',
                        [canonical],
                    )
                ).rows[0].character_id,
            ).toBe(character);
            expect(
                (
                    await client.query('SELECT id FROM cards WHERE id=$1', [
                        archived,
                    ])
                ).rows,
            ).toHaveLength(1);
            expect(applied.canonicalDataUnchanged).toBe(true);
            if (!applied.backup)
                throw new Error('Expected a backup before deletion');
            expect((await fs.stat(applied.backup)).size).toBeGreaterThan(0);
            expect((await fs.stat(applied.backup)).mode & 0o077).toBe(0);
            expect(
                (
                    await client.query(
                        'SELECT * FROM wiki_story_links ORDER BY id',
                    )
                ).rows,
            ).toEqual(before);
            const repeat = await cleanupLegacyData({ ...config, apply: true });
            expect(
                Object.values(repeat.deleted).every((count) => count === 0),
            ).toBe(true);
            expect(
                (
                    await client.query(
                        'SELECT count(*)::int AS count FROM cg_stories',
                    )
                ).rows[0].count,
            ).toBe(0);
            await client.query(
                "INSERT INTO cg_stories(id,idol_id,category,card_name,up_name,video_title,url,subtitle,image_file) VALUES (102,$1,'清理分类','未迁移卡','作者','未迁移','https://example.test/missing','原字幕','old.webp'),(103,$1,'清理分类','测试卡','作者','视频','https://example.test/story','原字幕','old.webp')",
                [entry],
            );
            await client.query(
                "INSERT INTO wiki_story_links(agency_id,card_id,up_name,video_title,url,display_order,legacy_table,legacy_id,legacy_subtitle,legacy_image_file,content_type_id,source_platform_id) VALUES ($1,$2,'作者','视频','https://example.test/story',1,'cg_stories',103,'原字幕','old.webp',1,2)",
                [project, card],
            );
            await expect(
                cleanupLegacyData({ ...config, apply: true }),
            ).rejects.toThrow(/not exactly reconciled/);
            const partial = await cleanupLegacyData({
                ...config,
                apply: true,
                verifiedOnly: true,
            });
            expect(partial.deleted.cg_stories).toBe(1);
            expect(partial.blocked).toBe(1);
            expect(partial.canonicalDataUnchanged).toBe(true);
            expect(
                (
                    await client.query('SELECT id FROM cg_stories ORDER BY id')
                ).rows.map((row) => String(row.id)),
            ).toEqual(['102']);
        } finally {
            await client.end();
            await harness.close();
            await fs.rm(directory, { recursive: true, force: true });
        }
    },
);
