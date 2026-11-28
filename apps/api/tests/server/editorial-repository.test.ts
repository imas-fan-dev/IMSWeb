import assert from 'node:assert/strict';
import { describe } from 'vitest';
import { SqlEditorialRepository } from '@/infra/db/repositories/editorial-repository';
import { executeSql } from '@/infra/db/sql/query';
import {
    createPostgresTestDatabase,
    postgresTest as test
} from '../postgres-test-database';

describe('editorial repository', () => {
    test('public spotlight rows carry the body and source URL used for direct links', async () => {
        const database = await createPostgresTestDatabase('editorial-spotlight');
        const repository = new SqlEditorialRepository(database);
        await executeSql(database,
            `INSERT INTO articles (id, content_type, title, body_json, status)
             VALUES (?, ?, ?, ?, 'published')`,
            [1, 'event', '只有来源的帖子', JSON.stringify({ type: 'doc', content: [] })]
        );
        await executeSql(database,
            `INSERT INTO events
             (id, article_id, title, kind, publication_state, source_url)
             VALUES (?, ?, ?, 'notice', 'ready', ?)`,
            [1, 1, '只有来源的帖子', 'https://example.test/original']
        );
        await executeSql(database,
            `INSERT INTO homepage_spotlight_entries (post_id, category, sort_order)
             VALUES (?, 'activity', 0)`,
            [1]
        );

        const [row] = await repository.listPublicSpotlightEntries();

        assert.deepEqual(row.body_json, { type: 'doc', content: [] });
        assert.equal(row.source_url, 'https://example.test/original');
    });
});
