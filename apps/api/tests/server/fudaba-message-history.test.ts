import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { createPostgresTestHarness } from '../integration/postgres-harness';

test(
    'V2 forward migration preserves legacy bodies, visibility, timestamps and stable placement',
    { timeout: 60000 },
    async () => {
        const migrations = fs
            .readdirSync(path.resolve('migrations/postgresql'))
            .filter((filename) => filename.endsWith('.sql'))
            .sort()
            .map((filename) => ({
                filename,
                version: filename.slice(0, -4),
                sql: fs.readFileSync(
                    path.resolve('migrations/postgresql', filename),
                    'utf8',
                ),
            }));
        const target = migrations.find(
            (migration) =>
                migration.filename ===
                '20261013120000_fudaba_message_wall_v2.sql',
        )!;
        const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'ims-message-history-'),
        );
        onTestFinished(() =>
            fs.rmSync(directory, { recursive: true, force: true }),
        );
        for (const migration of migrations.filter(
            (migration) => migration.version < target.version,
        )) {
            fs.writeFileSync(
                path.join(directory, migration.filename),
                migration.sql,
            );
        }
        const harness = await createPostgresTestHarness({
            label: 'message-history',
            migrationsPath: directory,
            seedCanonicalAgencies: false,
        });
        onTestFinished(() => harness.close());
        const db = harness.connection;
        const created = '2026-10-10T08:00:00.000Z';
        const hidden = '2026-10-11T08:00:00.000Z';
        await db
            .prepare(
                "INSERT INTO platform_accounts (id,status,token_version,created_at,updated_at) VALUES ('owner','active',0,0,0),('author','active',0,0,0)",
            )
            .run();
        await db
            .prepare(
                "INSERT INTO fudaba_offices (id,owner_account_id,slug,name,city,address,latitude,longitude,created_at,updated_at) VALUES ('office','owner','history-office','History','Shanghai','Address',31,121,?,?)",
            )
            .bind(created, created)
            .run();
        await db
            .prepare(
                "UPDATE fudaba_office_walls SET max_z_index=17 WHERE office_id='office'",
            )
            .run();
        await db
            .prepare(
                "INSERT INTO fudaba_messages (id,office_id,author_account_id,content,created_at,hidden_at,hidden_by_account_id) VALUES ('old-visible','office','author','旧公开留言 😀',?,NULL,NULL),('old-hidden','office','author','旧隐藏留言',?,?,'owner')",
            )
            .bind(created, created, hidden)
            .run();
        await db.executeScript(target.sql);
        const result = await db
            .prepare(
                `SELECT m.id,m.content,m.color,m.content_revision,m.moderation_revision,m.created_at,m.updated_at,m.hidden_at,m.hidden_by_account_id,p.world_x,p.world_y,p.rotation,p.z_index,p.revision FROM fudaba_messages m JOIN fudaba_message_placements p ON p.message_id=m.id ORDER BY m.id`,
            )
            .all<Record<string, unknown>>();
        expect(result.results).toHaveLength(2);
        const [first, second] = result.results;
        expect(first).toMatchObject({
            id: 'old-hidden',
            content: '旧隐藏留言',
            color: 'cream',
            content_revision: 0,
            moderation_revision: 0,
            hidden_by_account_id: 'owner',
            rotation: 0,
            revision: 0,
        });
        expect(first.hidden_at).not.toBeNull();
        expect(second).toMatchObject({
            id: 'old-visible',
            content: '旧公开留言 😀',
            color: 'cream',
            hidden_at: null,
            hidden_by_account_id: null,
            content_revision: 0,
            moderation_revision: 0,
            rotation: 0,
            revision: 0,
        });
        expect(first.updated_at).toEqual(first.created_at);
        expect(second.updated_at).toEqual(second.created_at);
        expect(Number(first.z_index)).toBeGreaterThan(17);
        expect(Number(second.z_index)).toBeGreaterThan(Number(first.z_index));
        expect([first.world_x, first.world_y]).not.toEqual([
            second.world_x,
            second.world_y,
        ]);
        const count = await db
            .prepare(
                "SELECT max_z_index FROM fudaba_office_walls WHERE office_id='office'",
            )
            .first<{ max_z_index: number }>();
        expect(count?.max_z_index).toBe(Number(second.z_index));
    },
);
