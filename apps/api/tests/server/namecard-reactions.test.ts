import { postgresTest } from '../postgres-test-database';
import assert from 'node:assert/strict';
import { describe, onTestFinished } from 'vitest';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlReactionRepository } from '@/infra/db/repositories/reaction-repository';
import { executeSql } from '@/infra/db/sql/query';
import { createPostgresTestDatabase } from '../postgres-test-database';

const CANONICAL_FRONT = 'community/namecards/assets/reaction-seed/front/image.webp';
const CANONICAL_BACK = 'community/namecards/assets/reaction-seed/back/image.webp';

async function seedCard(
    connection: Parameters<typeof executeSql>[0],
    values: {
        id: string;
        cardNumber: number;
        origin: 'legacy' | 'exchange';
        frontObjectKey: string;
        publicationStatus: 'published' | 'pending';
    }
): Promise<void> {
    await executeSql(
        connection,
        `INSERT INTO fudaba_cards
            (id, card_number, origin, front_object_key, back_object_key,
             trade_note, exchange_mode, publication_status,
             revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'none', ?, 0,
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
            values.id,
            values.cardNumber,
            values.origin,
            values.frontObjectKey,
            values.frontObjectKey.replace('front', 'back'),
            values.publicationStatus
        ]
    );
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
            frontObjectKey: CANONICAL_FRONT,
            publicationStatus: 'published'
        });
        await seedCard(connection, {
            id: 'reaction-fudaba-layout',
            cardNumber: 6302,
            origin: 'exchange',
            frontObjectKey: 'community/fudaba/cards/reaction/versions/0/front.webp',
            publicationStatus: 'published'
        });
        await seedCard(connection, {
            id: 'reaction-pending',
            cardNumber: 6303,
            origin: 'exchange',
            frontObjectKey:
                'community/namecards/assets/reaction-pending/front/image.webp',
            publicationStatus: 'pending'
        });

        assert.deepEqual(await reactions.findApprovedCard(6301), { id: 6301 });
        assert.equal(await reactions.findApprovedCard(6302), null);
        assert.equal(await reactions.findApprovedCard(6303), null);

        await reactions.incrementReaction(6301, '❤️');
        assert.deepEqual(await reactions.listReactions(6301), [
            { emoji: '❤️', count: 1 }
        ]);
    }, 30_000);
});
