import { postgresTest } from '../postgres-test-database';
import assert from 'node:assert/strict';
import { describe, onTestFinished } from 'vitest';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlReactionRepository } from '@/infra/db/repositories/reaction-repository';
import { executeSql } from '@/infra/db/sql/query';
import { createPostgresTestDatabase } from '../postgres-test-database';

const LIVE_VERSION = '11111111-1111-4111-8111-111111111111';
const SECOND_VERSION = '22222222-2222-4222-8222-222222222222';
const MIDDLE_VERSION = '33333333-3333-4333-8333-333333333333';

/** 公开墙只认线上页面行：`livePages` 就是这张卡的版面容。 */
async function seedCard(
    connection: Parameters<typeof executeSql>[0],
    values: {
        id: string;
        cardNumber: number;
        origin: 'legacy' | 'exchange';
        publicationStatus: 'published' | 'pending';
        livePages: readonly { pageId: string; objectVersion: string }[];
    }
): Promise<void> {
    await executeSql(
        connection,
        `INSERT INTO fudaba_cards
            (id, card_number, origin,
             trade_note, exchange_mode, publication_status,
             revision, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'none', ?, 0,
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [values.id, values.cardNumber, values.origin, values.publicationStatus]
    );
    for (const [index, page] of values.livePages.entries()) {
        await executeSql(
            connection,
            `INSERT INTO public.fudaba_card_pages
                (card_id, queue, page_id, display_order, object_version,
                 width, height, created_at, updated_at)
             VALUES (?, 'live', ?, ?, ?::uuid, 100, 50,
                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [values.id, page.pageId, index + 1, page.objectVersion]
        );
    }
}

describe('namecard reactions resolve the same cards the wall lists', () => {
    postgresTest('accepts a published registered card whose media is canonical', async () => {
        const connection = await createPostgresTestDatabase('namecard-reactions');
        onTestFinished(() => connection.close());
        await new SqlCoreRepository(connection, new PostgresqlSchemaStrategy()).initialize();
        const reactions = new SqlReactionRepository(connection);

        await seedCard(connection, {
            id: 'reaction-exchange',
            cardNumber: 6301,
            origin: 'exchange',
            publicationStatus: 'published',
            livePages: [
                { pageId: 'front', objectVersion: LIVE_VERSION },
                { pageId: 'back', objectVersion: SECOND_VERSION }
            ]
        });
        // 属主换图后媒体落在统一页面布局（多一张中间页），同样是公开墙的卡。
        await seedCard(connection, {
            id: 'reaction-page-layout',
            cardNumber: 6302,
            origin: 'exchange',
            publicationStatus: 'published',
            livePages: [
                { pageId: 'front', objectVersion: LIVE_VERSION },
                { pageId: 'page-aaaaaaaa', objectVersion: MIDDLE_VERSION },
                { pageId: 'back', objectVersion: SECOND_VERSION }
            ]
        });
        await seedCard(connection, {
            id: 'reaction-pending',
            cardNumber: 6303,
            origin: 'exchange',
            publicationStatus: 'pending',
            livePages: []
        });

        assert.deepEqual(await reactions.findApprovedCard(6301), { id: 6301 });
        // 统一布局（正反面之外还有中间页）同样属于公开墙。
        assert.deepEqual(await reactions.findApprovedCard(6302), { id: 6302 });
        assert.equal(await reactions.findApprovedCard(6303), null);

        await reactions.incrementReaction(6301, '❤️');
        assert.deepEqual(await reactions.listReactions(6301), [
            { emoji: '❤️', count: 1 }
        ]);
    }, 30_000);
});
