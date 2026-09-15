import type {
    NewsInput,
    NewsRepository,
} from '@/ports/repositories/content';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';

export class SqlNewsRepository implements NewsRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    listPublicNews(): Promise<Record<string, unknown>[]> {
        return queryAll(
            this.database,
            'SELECT id, title, thumbnail, content, date FROM news ORDER BY id DESC',
        );
    }

    async findLatestPublicNewsId(): Promise<string | null> {
        const row = await queryOne<{ id: string | null }>(
            this.database,
            'SELECT CAST(MAX(id) AS TEXT) AS id FROM news',
        );
        return row?.id ?? null;
    }

    listPublicNewsByCursor(
        limit: number,
        snapshotId: string,
        afterId?: string,
    ): Promise<Record<string, unknown>[]> {
        if (afterId) {
            return queryAll(
                this.database,
                `SELECT id, title, thumbnail, content, date FROM news
                 WHERE id<=? AND id<? ORDER BY id DESC LIMIT ?`,
                [snapshotId, afterId, limit],
            );
        }
        return queryAll(
            this.database,
            `SELECT id, title, thumbnail, content, date FROM news
             WHERE id<=? ORDER BY id DESC LIMIT ?`,
            [snapshotId, limit],
        );
    }

    listAdminNews(): Promise<Record<string, unknown>[]> {
        return queryAll(this.database, 'SELECT * FROM news ORDER BY id DESC');
    }

    async insertNews(input: NewsInput): Promise<number> {
        const result = await queryOne<{ id: number }>(
            this.database,
            `INSERT INTO news (title, image, thumbnail, content, date, author)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
            [
                input.title,
                input.image,
                input.thumbnail,
                input.content,
                input.date,
                input.author,
            ],
        );
        if (!result) throw new Error('News insert did not return an ID');
        return result.id;
    }

    findNewsMedia(
        id: number,
    ): Promise<{ image: string; thumbnail: string } | null> {
        return queryOne(
            this.database,
            'SELECT image, thumbnail FROM news WHERE id=?',
            [id],
        );
    }

    async deleteNews(id: number): Promise<void> {
        await executeSql(this.database, 'DELETE FROM news WHERE id=?', [id]);
    }
}
