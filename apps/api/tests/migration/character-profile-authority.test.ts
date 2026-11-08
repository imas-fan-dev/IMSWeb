import { afterAll, expect, onTestFinished, test } from 'vitest';
import { Client } from 'pg';
import { migratePostgres } from '../../scripts/migration/postgres-migrations';
import { createMigrationCatalogBefore } from '../integration/migration-catalog';
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled,
} from '../integration/postgres-harness';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';

afterAll(() => closeSharedPostgresTestAllocator());

test.skipIf(!postgresIntegrationEnabled())(
    'authority upgrade preserves explicit names, other-project order, CV, media, references and stale-write protection',
    async () => {
        const migrationsPath = await createMigrationCatalogBefore(
            onTestFinished,
            '20261105190000_character_profile_authority.sql',
        );
        const harness = await createPostgresTestHarness({
            label: 'authority_upgrade',
            migrationsPath,
        });
        const client = new Client({ connectionString: harness.databaseUrl });
        try {
            await client.connect();
            const projects = (
                await client.query(
                    "SELECT id,code FROM projects WHERE code IN ('765','ml')",
                )
            ).rows;
            const primaryProject = projects.find((p) => p.code === '765')!.id;
            const otherProject = projects.find((p) => p.code === 'ml')!.id;
            const character = (
                await client.query(
                    "INSERT INTO catalog_characters(default_project_id,name_cn,aliases,category,display_order) VALUES ($1,'原姓名','既有别名','idol',9) RETURNING id,revision",
                    [primaryProject],
                )
            ).rows[0];
            const profile = (
                await client.query(
                    "UPDATE catalog_character_project_profiles SET name_cn='企划姓名',cv_name='人工声优',avatar_object_key='stable.webp',avatar_rotation=90,birth_month=2,birth_day=29 WHERE character_id=$1 RETURNING *",
                    [character.id],
                )
            ).rows[0];
            await client.query(
                "INSERT INTO catalog_character_project_profiles(character_id,project_id,name_cn,display_order,cv_name) VALUES ($1,$2,'另企划姓名',77,'另一声优')",
                [character.id, otherProject],
            );
            await client.query(
                "INSERT INTO fudaba_cards(id,card_number,origin,front_object_key,back_object_key,publication_status,exchange_mode,trade_note,created_at,updated_at) VALUES ('upgrade-card',9000,'legacy','front.webp','back.webp','published','none',NULL,now(),now())",
            );
            await client.query(
                "INSERT INTO fudaba_card_favorite_characters(card_id,character_id,display_order) VALUES ('upgrade-card',$1,0)",
                [character.id],
            );
            const favorites = (
                await client.query(
                    'SELECT * FROM fudaba_card_favorite_characters ORDER BY card_id,display_order',
                )
            ).rows;
            const first = await migratePostgres({
                connectionString: harness.databaseUrl,
            });
            expect(first.executed).toEqual([
                '20261105190000_character_profile_authority',
                '20261105200000_catalog_public_facts',
        '20261106120000_namecard_exchange_system',
                '20261107120000_namecard_media_key_normalization',
                '20261107160000_namecard_group_card',
                '20261107180000_fudaba_card_pages',

            ]);
            const current = (
                await client.query(
                    'SELECT * FROM namecard_characters WHERE id=$1',
                    [character.id],
                )
            ).rows[0];
            expect(current.name_cn).toBe('企划姓名');
            expect(current.aliases).toContain('原姓名');
            expect(current.aliases).toContain('既有别名');
            expect(current.revision).toBe(character.revision + 1);
            expect(
                (
                    await client.query(
                        'UPDATE namecard_characters SET name_cn=$1 WHERE id=$2 AND revision=$3',
                        ['过期覆盖', character.id, character.revision],
                    )
                ).rowCount,
            ).toBe(0);
            const profiles = (
                await client.query(
                    'SELECT * FROM catalog_character_project_profiles WHERE character_id=$1 ORDER BY project_id',
                    [character.id],
                )
            ).rows;
            expect(profiles.find((p) => p.id === profile.id)).toMatchObject({
                name_cn: '企划姓名',
                cv_name: '人工声优',
                avatar_object_key: 'stable.webp',
                avatar_rotation: 90,
                birth_month: 2,
                birth_day: 29,
                display_order: 9,
            });
            expect(
                profiles.find((p) => p.project_id === otherProject),
            ).toMatchObject({
                name_cn: '另企划姓名',
                display_order: 77,
                cv_name: '另一声优',
            });
            expect(
                (
                    await client.query(
                        'SELECT * FROM fudaba_card_favorite_characters ORDER BY card_id,display_order',
                    )
                ).rows,
            ).toEqual(favorites);
            expect(
                (
                    await client.query(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='catalog_characters' AND column_name IN ('name_cn','aliases','category','display_order','default_project_id')",
                    )
                ).rows,
            ).toEqual([]);
            expect(
                (
                    await migratePostgres({
                        connectionString: harness.databaseUrl,
                    })
                ).executed,
            ).toEqual([]);
            await client.query(
                "DELETE FROM ims_schema_migrations WHERE version='20261105120000_platform_profile_slug_not_numeric'",
            );
            await expect(
                new PostgresqlSchemaStrategy().initializeCore(
                    harness.connection,
                ),
            ).rejects.toThrow(
                /20261105120000_platform_profile_slug_not_numeric/,
            );
        } finally {
            await client.end();
            await harness.close();
        }
    },
);

test.skipIf(!postgresIntegrationEnabled())(
    'an overlong combined alias fails atomically without deleting source data or advancing the ledger',
    async () => {
        const migrationsPath = await createMigrationCatalogBefore(
            onTestFinished,
            '20261105190000_character_profile_authority.sql',
        );
        const harness = await createPostgresTestHarness({
            label: 'authority_rollback',
            migrationsPath,
        });
        const client = new Client({ connectionString: harness.databaseUrl });
        try {
            await client.connect();
            const project = (
                await client.query("SELECT id FROM projects WHERE code='765'")
            ).rows[0].id;
            const character = (
                await client.query(
                    "INSERT INTO catalog_characters(default_project_id,name_cn,aliases) VALUES ($1,'需要保留的原名',$2) RETURNING id",
                    [project, 'a'.repeat(4000)],
                )
            ).rows[0].id;
            await client.query(
                "UPDATE catalog_character_project_profiles SET name_cn='已有企划名' WHERE character_id=$1",
                [character],
            );
            const before = (
                await client.query(
                    'SELECT * FROM catalog_characters WHERE id=$1',
                    [character],
                )
            ).rows;
            await expect(
                migratePostgres({ connectionString: harness.databaseUrl }),
            ).rejects.toMatchObject({ code: '23514' });
            expect(
                (
                    await client.query(
                        'SELECT * FROM catalog_characters WHERE id=$1',
                        [character],
                    )
                ).rows,
            ).toEqual(before);
            expect(
                (
                    await client.query(
                        "SELECT version FROM ims_schema_migrations WHERE version='20261105190000_character_profile_authority'",
                    )
                ).rows,
            ).toEqual([]);
        } finally {
            await client.end();
            await harness.close();
        }
    },
);
