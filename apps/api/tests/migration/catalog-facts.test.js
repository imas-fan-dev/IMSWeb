import { afterAll, expect, test } from 'vitest';
import { Client } from 'pg';
import { importCatalogFacts } from '../../scripts/migration/catalog-facts';
import { createPostgresTestHarness, postgresIntegrationEnabled } from '../integration/postgres-harness';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle';
import fs from 'node:fs';
import path from 'node:path';

afterAll(() => closeSharedPostgresTestAllocator());

test.skipIf(!postgresIntegrationEnabled())('catalog facts dry-run is read-only and replay preserves manual data and public presentation', async () => {
    const harness = await createPostgresTestHarness({ label: 'catalog_facts' });
    const client = new Client({ connectionString: harness.databaseUrl });
    try {
        await client.connect();
        const project = (await client.query("SELECT id FROM projects WHERE code='cg'")).rows[0].id;
        const character = (await client.query(
            `INSERT INTO namecard_characters(agency_id,name_cn,name_ja) VALUES ($1,'兵藤丽那','兵藤レナ') RETURNING id`, [project]
        )).rows[0].id;
        await client.query('UPDATE catalog_character_project_profiles SET cv_name=$1 WHERE character_id=$2', ['人工维护声优',character]);
        const before = (await client.query('SELECT * FROM catalog_character_project_profiles WHERE character_id=$1', [character])).rows;
        const dry = await importCatalogFacts({ connectionString: harness.databaseUrl });
        expect(dry.applied).toBe(false);
        expect((await client.query('SELECT * FROM catalog_character_project_profiles WHERE character_id=$1', [character])).rows).toEqual(before);
        await importCatalogFacts({ connectionString: harness.databaseUrl, apply: true });
        const applied = (await client.query('SELECT * FROM catalog_character_project_profiles WHERE character_id=$1', [character])).rows;
        expect(applied[0].birth_month).toBe(10);
        expect(applied[0].birth_day).toBe(3);
        expect(applied[0].cv_name).toBe('人工维护声优');
        await importCatalogFacts({ connectionString: harness.databaseUrl, apply: true });
        expect((await client.query('SELECT * FROM catalog_character_project_profiles WHERE character_id=$1', [character])).rows).toEqual(applied);
        await client.query('UPDATE catalog_character_project_profiles SET birth_month=1,birth_day=1 WHERE character_id=$1', [character]);
        const conflict = await importCatalogFacts({ connectionString: harness.databaseUrl, apply: true });
        expect(conflict.conflicts.some((c) => c.source === 'birthday')).toBe(true);
        expect((await client.query('SELECT birth_month,birth_day FROM catalog_character_project_profiles WHERE character_id=$1', [character])).rows[0]).toEqual({ birth_month: 1, birth_day: 1 });
    } finally {
        await client.end();
        await harness.close();
    }
});

test.skipIf(!postgresIntegrationEnabled())('facts dry-run predicts creation and binding without touching rows or identity sequences', async () => {
    const harness = await createPostgresTestHarness({ label: 'catalog_facts_creation' });
    const client = new Client({ connectionString: harness.databaseUrl });
    try {
        await client.connect();
        const record = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../web/app/pages/home/idol-birthdays.json'),'utf8')).find((row) => row.agency === '765PRO');
        const project = (await client.query("SELECT id FROM projects WHERE code='765'")).rows[0].id;
        const entry = (await client.query(`INSERT INTO wiki_entries(project_id,local_name_cn,storage_slug,local_accent_color,local_image_object_key)
            VALUES ($1,$2,'facts_new','#123456','catalog/facts/new.webp') RETURNING id`,[project,record.name])).rows[0].id;
        const sequence = async () => (await client.query('SELECT last_value::text,is_called FROM catalog_characters_id_seq')).rows;
        const before = await sequence();
        const dry = await importCatalogFacts({ connectionString: harness.databaseUrl });
        expect(dry.charactersCreated).toBe(1);
        expect(dry.profilesCreated).toBe(1);
        expect(dry.entriesBound).toBe(1);
        expect(dry.unresolved.some((row) => row.name === record.name && row.project === record.agency)).toBe(false);
        expect(await sequence()).toEqual(before);
        expect((await client.query('SELECT character_profile_id FROM wiki_entries WHERE id=$1',[entry])).rows[0].character_profile_id).toBeNull();
        const applied = await importCatalogFacts({ connectionString: harness.databaseUrl,apply: true });
        expect([applied.charactersCreated,applied.profilesCreated,applied.entriesBound]).toEqual([1,1,1]);
        const profiles = (await client.query('SELECT p.* FROM catalog_character_project_profiles p JOIN wiki_entries e ON e.character_profile_id=p.id WHERE e.id=$1',[entry])).rows;
        expect(profiles[0].avatar_object_key).toBe('catalog/facts/new.webp');
        const repeat = await importCatalogFacts({ connectionString: harness.databaseUrl,apply: true });
        expect([repeat.charactersCreated,repeat.profilesCreated,repeat.entriesBound]).toEqual([0,0,0]);
        expect((await client.query('SELECT p.* FROM catalog_character_project_profiles p JOIN wiki_entries e ON e.character_profile_id=p.id WHERE e.id=$1',[entry])).rows).toEqual(profiles);
    } finally { await client.end(); await harness.close(); }
});

test.skipIf(!postgresIntegrationEnabled())('fact binding refuses to replace a maintained profile presentation or CV', async () => {
    const harness = await createPostgresTestHarness({ label: 'catalog_facts_manual' });
    const client = new Client({ connectionString: harness.databaseUrl });
    try {
        await client.connect();
        const record = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../web/app/pages/home/idol-birthdays.json'),'utf8')).find((row) => row.agency === '765PRO');
        const project = (await client.query("SELECT id FROM projects WHERE code='765'")).rows[0].id;
        const character = (await client.query("INSERT INTO namecard_characters(agency_id,name_cn) VALUES ($1,$2) RETURNING id",[project,record.name])).rows[0].id;
        await client.query("UPDATE catalog_character_project_profiles SET representative_color='#111111',avatar_object_key='manual.webp',cv_name='人工声优',revision=7 WHERE character_id=$1",[character]);
        const entry = (await client.query("INSERT INTO wiki_entries(project_id,local_name_cn,storage_slug,local_accent_color,local_image_object_key) VALUES ($1,$2,'facts_manual','#222222','wiki.webp') RETURNING id",[project,record.name])).rows[0].id;
        const report = await importCatalogFacts({ connectionString: harness.databaseUrl,apply: true });
        expect(report.conflicts.some((row) => row.entryId === entry && row.reason === 'maintained-presentation-differs')).toBe(true);
        expect((await client.query('SELECT representative_color,avatar_object_key,cv_name FROM catalog_character_project_profiles WHERE character_id=$1',[character])).rows[0]).toEqual({ representative_color: '#111111',avatar_object_key: 'manual.webp',cv_name: '人工声优' });
        expect((await client.query('SELECT character_profile_id FROM wiki_entries WHERE id=$1',[entry])).rows[0].character_profile_id).toBeNull();
        await client.query('UPDATE catalog_character_project_profiles SET representative_color=NULL,avatar_object_key=NULL,avatar_media_revision=5,revision=0 WHERE character_id=$1',[character]);
        await importCatalogFacts({ connectionString: harness.databaseUrl,apply: true });
        expect((await client.query('SELECT avatar_object_key,avatar_media_revision,cv_name FROM catalog_character_project_profiles WHERE character_id=$1',[character])).rows[0]).toEqual({ avatar_object_key: null,avatar_media_revision: 5,cv_name: '人工声优' });
    } finally { await client.end(); await harness.close(); }
});
