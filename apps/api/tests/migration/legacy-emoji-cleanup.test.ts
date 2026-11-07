import { afterAll, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client } from 'pg';
import { cleanupLegacyData } from '../../scripts/migration/legacy-data-cleanup';
import { reconcile } from '../../scripts/migration/namecard-unification-reconcile';
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled
} from '../integration/postgres-harness';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle';

afterAll(() => closeSharedPostgresTestAllocator());

test.skipIf(!postgresIntegrationEnabled())(
    'emoji cleanup verifies each counter, preserves live reactions, records receipts and restores guards on rollback',
    async () => {
        const harness = await createPostgresTestHarness({
            label: 'emoji_cleanup'
        });
        const client = new Client({ connectionString: harness.databaseUrl });
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'ims-emoji-backup-')
        );
        try {
            await client.connect();
            await client.query('BEGIN');
            await client.query(
                'ALTER TABLE cards DISABLE TRIGGER cards_read_only'
            );
            await client.query(
                'ALTER TABLE card_emojis DISABLE TRIGGER card_emojis_read_only'
            );
            await client.query(
                "INSERT INTO cards(id,image1_url,image2_url,submission_kind) SELECT n,'front-'||n||'.png','back-'||n||'.png','legacy' FROM generate_series(100,110) n"
            );
            // Restore the same NOT VALID FK after seeding a historical orphan. New
            // production inserts remain checked; only this fixture predates the FK.
            await client.query(
                'ALTER TABLE card_emojis DROP CONSTRAINT card_emojis_card_id_fkey'
            );
            await client.query(`INSERT INTO card_emojis(card_id,emoji,count) VALUES
            (100,'❤️',2),(100,'🧪',3),(101,'👍',4),(102,'✨',5),
            (103,'🔥',6),(104,'😂',6),(105,'😭',6),(106,'👀',1),(107,'🔨',1),
            (999,'🌹',1),(108,'❤️',0),(109,'👍',-1),(110,'✨',NULL)`);
            await client.query(
                'ALTER TABLE card_emojis ADD CONSTRAINT card_emojis_card_id_fkey FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE NOT VALID'
            );
            await client.query(
                'ALTER TABLE card_emojis ENABLE TRIGGER card_emojis_read_only'
            );
            await client.query(
                'ALTER TABLE cards ENABLE TRIGGER cards_read_only'
            );
            await client.query('COMMIT');
            await client.query(
                "INSERT INTO platform_accounts(id,status,created_at,updated_at) VALUES ('emoji-owner','active',1,1)"
            );
            await client.query(`INSERT INTO fudaba_cards(id,card_number,origin,exchange_mode,trade_note,front_object_key,back_object_key,created_at,updated_at)
            SELECT 'emoji-'||n,n,'legacy','none',NULL,'front-'||n||'.png','back-'||n||'.png',now(),now() FROM generate_series(100,110) n WHERE n<>107`);
            await client.query(
                "UPDATE fudaba_cards SET owner_account_id='emoji-owner',legacy_card_id=101,producer_name='Owner',trade_note='' WHERE card_number=101"
            );
            await client.query(
                'UPDATE fudaba_cards SET deleted_at=now() WHERE card_number IN (102,103)'
            );
            await client.query(`INSERT INTO fudaba_cards(id,card_number,origin,exchange_mode,trade_note,front_object_key,back_object_key,created_at,updated_at)
            VALUES ('emoji-merge-target',2000,'legacy','none',NULL,'front-target.png','back-target.png',now(),now())`);
            await client.query(`INSERT INTO namecard_reactions(card_id,emoji,count) VALUES
            ('emoji-100','❤️',2),('emoji-100','🧪',3),('emoji-101','👍',4),('emoji-102','✨',5),
            ('emoji-104','😂',7),('emoji-105','😭',5),('emoji-merge-target','🔥',1000)`);
            const config = {
                connectionString: harness.databaseUrl,
                confirmTargetDatabase: new URL(
                    harness.databaseUrl
                ).pathname.slice(1),
                backupDirectory: directory,
                scopes: ['emojis']
            };
            const reactions = async () =>
                (
                    await client.query(
                        'SELECT * FROM namecard_reactions ORDER BY card_id,emoji'
                    )
                ).rows;
            const guards = async () =>
                (
                    await client.query(
                        "SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='public.card_emojis'::regclass AND NOT tgisinternal ORDER BY tgname"
                    )
                ).rows;
            const before = await reactions();
            const guardBefore = await guards();
            const dry = await cleanupLegacyData(config);
            expect(dry.plan.emojis.keys).toHaveLength(4);
            expect(dry.plan.emojis.blocked).toHaveLength(9);
            expect(
                new Set(dry.plan.emojis.blocked.map((row) => row.reason))
            ).toEqual(
                new Set([
                    'orphan-legacy-card',
                    'missing-canonical-card',
                    'nonpositive-legacy-count',
                    'missing-current-counter',
                    'counter-changed'
                ])
            );
            expect(dry.plan.stories).toEqual({});
            expect(await fs.readdir(directory)).toEqual([]);
            await expect(
                cleanupLegacyData({ ...config, scopes: ['emojis', 'emojis'] })
            ).rejects.toThrow(/scope/);
            await expect(
                cleanupLegacyData({ ...config, apply: true })
            ).rejects.toThrow(/not exactly reconciled/);
            await expect(
                cleanupLegacyData({
                    ...config,
                    apply: true,
                    verifiedOnly: true,
                    dumpBinary: '/no-such-pg-dump'
                })
            ).rejects.toThrow(/could not start/);
            expect(await reactions()).toEqual(before);
            expect(await guards()).toEqual(guardBefore);
            await client.query(
                'CREATE TABLE emoji_dependent_fixture(id bigint REFERENCES card_emojis(id) ON DELETE CASCADE)'
            );
            await expect(cleanupLegacyData(config)).rejects.toThrow(
                /incoming foreign keys/
            );
            await client.query('DROP TABLE emoji_dependent_fixture');
            await client.query(`CREATE FUNCTION emoji_mutation_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN UPDATE namecard_reactions SET count=count+1 WHERE card_id='emoji-100' AND emoji='❤️'; RETURN OLD; END $$;
            CREATE TRIGGER emoji_mutation_fixture AFTER DELETE ON card_emojis FOR EACH ROW EXECUTE FUNCTION emoji_mutation_fixture()`);
            await expect(
                cleanupLegacyData({
                    ...config,
                    apply: true,
                    verifiedOnly: true
                })
            ).rejects.toThrow(/Canonical data changed/);
            expect(
                (
                    await client.query(
                        'SELECT count(*)::int AS count FROM card_emojis'
                    )
                ).rows[0].count
            ).toBe(13);
            expect(
                (
                    await client.query(
                        "SELECT to_regclass('legacy_cleanup.emoji_receipts') AS name"
                    )
                ).rows[0].name
            ).toBeNull();
            expect(await reactions()).toEqual(before);
            expect(
                (await guards()).filter(
                    (row) => row.tgname !== 'emoji_mutation_fixture'
                )
            ).toEqual(guardBefore);
            await client.query(
                'DROP TRIGGER emoji_mutation_fixture ON card_emojis; DROP FUNCTION emoji_mutation_fixture()'
            );
            const applied = await cleanupLegacyData({
                ...config,
                apply: true,
                verifiedOnly: true
            });
            expect(applied.deleted).toEqual({ card_emojis: 4 });
            expect(applied.blocked).toBe(9);
            expect(applied.canonicalDataUnchanged).toBe(true);
            expect(await reactions()).toEqual(before);
            expect(await guards()).toEqual(guardBefore);
            expect(
                (await client.query('SELECT count(*)::int AS count FROM cards'))
                    .rows[0].count
            ).toBe(11);
            expect(
                (
                    await client.query(
                        'SELECT count(*)::int AS count FROM legacy_cleanup.emoji_receipts WHERE legacy_count=canonical_count'
                    )
                ).rows[0].count
            ).toBe(4);
            expect((await reconcile(client)).reactionOnlyOnUnifiedSide).toEqual(
                []
            );
            await expect(
                client.query(
                    "INSERT INTO card_emojis(card_id,emoji,count) VALUES (100,'❓',1)"
                )
            ).rejects.toThrow(/read.only/i);
            await expect(client.query('TRUNCATE card_emojis')).rejects.toThrow(
                /read.only/i
            );
            const repeated = await cleanupLegacyData({
                ...config,
                apply: true,
                verifiedOnly: true
            });
            expect(repeated.deleted.card_emojis).toBe(0);
            expect(
                (
                    await client.query(
                        'SELECT count(*)::int AS count FROM legacy_cleanup.emoji_receipts'
                    )
                ).rows[0].count
            ).toBe(4);
            expect(await reactions()).toEqual(before);
        } finally {
            await client.end();
            await harness.close();
            await fs.rm(directory, { recursive: true, force: true });
        }
    }
);
