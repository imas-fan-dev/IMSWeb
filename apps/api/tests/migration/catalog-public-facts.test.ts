import { afterAll, expect, onTestFinished, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { migratePostgres } from '../../scripts/migration/postgres-migrations';
import { importCatalogFacts } from '../../scripts/migration/catalog-facts';
import { createMigrationCatalogBefore } from '../integration/migration-catalog';
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled
} from '../integration/postgres-harness';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle';

afterAll(() => closeSharedPostgresTestAllocator());

test.skipIf(!postgresIntegrationEnabled())(
    'SQL-only upgrade loads public facts, preserves manual profiles and world identities, and is repeatable',
    async () => {
        const migrationsPath = await createMigrationCatalogBefore(
            onTestFinished,
            '20261105200000_catalog_public_facts.sql'
        );
        const harness = await createPostgresTestHarness({
            label: 'public_facts_upgrade',
            migrationsPath
        });
        const client = new Client({ connectionString: harness.databaseUrl });
        try {
            await client.connect();
            const projects = new Map(
                (await client.query('SELECT code,id FROM projects')).rows.map(
                    (row) => [row.code, row.id]
                )
            );
            const identity = async (project: string, name: string) =>
                (
                    await client.query(
                        "INSERT INTO namecard_characters(agency_id,name_cn,category) VALUES ($1,$2,'idol') RETURNING id",
                        [projects.get(project), name]
                    )
                ).rows[0].id;
            const uzuki = await identity('cg', '岛村卯月');
            const rin = await identity('cg', '涩谷凛');
            const mio = await identity('cg', '本田未央');
            await client.query(
                "UPDATE catalog_character_project_profiles SET revision=3,cv_name='保留CV' WHERE character_id=$1",
                [mio]
            );
            const haruka = await identity('765', '天海春香');
            const dsRyo = await identity('876', '秋月涼');
            const sideRyo = await identity('sidem', '秋月凉');
            const wiki = async (project: string, name: string, slug: string) =>
                (
                    await client.query(
                        'INSERT INTO idols(agency_id,name_cn,folder_name,avatar_object_key) VALUES ($1,$2,$3,$4) RETURNING id',
                        [projects.get(project), name, slug, slug + '.webp']
                    )
                ).rows[0].id;
            await wiki('cg', '岛村卯月', 'shimamura_uzuki');
            const rinEntry = await wiki('cg', '涩谷凛', 'shibuya_rin');
            const mlEntry = await wiki('ml', '天海春香', 'amami_haruka');
            const newEntry = await wiki('ml', '田中琴叶', 'tanaka_kotoha');
            const retired = await identity('cg', '安部菜菜');
            const retiredEntry = await wiki('cg', '安部菜菜', 'abe_nana');
            await client.query(
                'UPDATE wiki_entries SET character_profile_id=(SELECT id FROM catalog_character_project_profiles WHERE character_id=$1) WHERE id=$2',
                [retired, retiredEntry]
            );
            await client.query(
                'UPDATE catalog_characters SET deleted_at=now() WHERE id=$1',
                [retired]
            );
            const retiredBefore = (
                await client.query(
                    'SELECT * FROM catalog_character_project_profiles WHERE character_id=$1',
                    [retired]
                )
            ).rows[0];
            const mlProfile = (
                await client.query(
                    "INSERT INTO catalog_character_project_profiles(character_id,project_id,name_cn,avatar_object_key) VALUES ($1,$2,'天海春香','amami_haruka.webp') RETURNING id",
                    [haruka, projects.get('ml')]
                )
            ).rows[0].id;
            await client.query(
                'UPDATE wiki_entries SET character_profile_id=$1 WHERE id=$2',
                [mlProfile, mlEntry]
            );
            await client.query(
                "UPDATE catalog_character_project_profiles SET birth_month=1,birth_day=2,voice_status='unvoiced',cv_name='人工CV',representative_color='#123456',avatar_object_key=NULL,avatar_media_revision=1,revision=7 WHERE character_id=$1",
                [rin]
            );
            const manualBefore = (
                await client.query(
                    'SELECT * FROM catalog_character_project_profiles WHERE character_id=$1',
                    [rin]
                )
            ).rows[0];
            const upgraded = await migratePostgres({
                connectionString: harness.databaseUrl
            });
            expect(upgraded.executed).toEqual([
                '20261105200000_catalog_public_facts',
                        '20261106120000_namecard_exchange_system',
                '20261107120000_namecard_media_key_normalization',
                '20261107160000_namecard_group_card',
                '20261107180000_fudaba_card_pages',

            ]);
            const seeded = (
                await client.query(
                    'SELECT * FROM catalog_character_project_profiles WHERE character_id=$1',
                    [uzuki]
                )
            ).rows[0];
            expect(seeded).toMatchObject({
                birth_month: 4,
                birth_day: 24,
                voice_status: 'voiced',
                avatar_object_key: 'shimamura_uzuki.webp'
            });
            expect(
                (
                    await client.query(
                        'SELECT * FROM catalog_character_project_profiles WHERE character_id=$1',
                        [retired]
                    )
                ).rows[0]
            ).toEqual(retiredBefore);
            expect(
                (
                    await client.query(
                        'SELECT birth_month,birth_day,representative_color,cv_name FROM catalog_character_project_profiles WHERE character_id=$1',
                        [mio]
                    )
                ).rows[0]
            ).toEqual({
                birth_month: 12,
                birth_day: 1,
                representative_color: null,
                cv_name: '保留CV'
            });
            expect(
                (
                    await client.query(
                        'SELECT * FROM catalog_character_project_profiles WHERE character_id=$1',
                        [rin]
                    )
                ).rows[0]
            ).toEqual(manualBefore);
            expect(
                (
                    await client.query(
                        'SELECT character_profile_id FROM wiki_entries WHERE id=$1',
                        [rinEntry]
                    )
                ).rows[0].character_profile_id
            ).toBeNull();
            const shared = (
                await client.query(
                    'SELECT * FROM catalog_character_project_profiles WHERE character_id=$1 ORDER BY project_id',
                    [haruka]
                )
            ).rows;
            expect(shared).toHaveLength(2);
            expect(
                shared.find((row) => row.project_id === projects.get('765'))
            ).toMatchObject({ birth_month: 4, birth_day: 3 });
            const ml = shared.find(
                (row) => row.project_id === projects.get('ml')
            )!;
            expect(ml.avatar_object_key).toBe('amami_haruka.webp');
            expect(ml.birth_month).toBeNull();
            expect(
                (
                    await client.query(
                        'SELECT character_profile_id FROM wiki_entries WHERE id=$1',
                        [mlEntry]
                    )
                ).rows[0].character_profile_id
            ).toBe(ml.id);
            expect(dsRyo).not.toBe(sideRyo);
            expect(
                (
                    await client.query(
                        'SELECT character_id,project_id,birth_month,birth_day FROM catalog_character_project_profiles WHERE character_id=ANY($1::bigint[])',
                        [[dsRyo, sideRyo]]
                    )
                ).rows
            ).toHaveLength(2);
            expect(
                (
                    await client.query(
                        'SELECT character_profile_id FROM wiki_entries WHERE id=$1',
                        [newEntry]
                    )
                ).rows[0].character_profile_id
            ).not.toBeNull();
            const snapshot = async () => ({
                profiles: (
                    await client.query(
                        'SELECT * FROM catalog_character_project_profiles ORDER BY id'
                    )
                ).rows,
                characters: (
                    await client.query(
                        'SELECT * FROM catalog_characters ORDER BY id'
                    )
                ).rows,
                entries: (
                    await client.query('SELECT * FROM wiki_entries ORDER BY id')
                ).rows,
                layouts: (
                    await client.query(
                        'SELECT * FROM wiki_project_settings ORDER BY project_id'
                    )
                ).rows
            });
            const before = await snapshot();
            const sql = await fs.readFile(
                path.resolve(
                    __dirname,
                    '../../migrations/postgresql/20261105200000_catalog_public_facts.sql'
                ),
                'utf8'
            );
            await client.query(sql);
            expect(await snapshot()).toEqual(before);
            await importCatalogFacts({
                connectionString: harness.databaseUrl,
                apply: true
            });
            expect(await snapshot()).toEqual(before);
            expect(
                (
                    await migratePostgres({
                        connectionString: harness.databaseUrl
                    })
                ).executed
            ).toEqual([]);
        } finally {
            await client.end();
            await harness.close();
        }
    }
);
