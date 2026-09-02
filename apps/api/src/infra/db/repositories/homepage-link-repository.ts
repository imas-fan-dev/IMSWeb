import type {
    HomepageLinkRecord,
    HomepageLinkRepository,
    HomepageLinkSection,
    HomepageLinkUpdateInput,
    NewHomepageLinkInput,
} from '@/ports/repositories/content';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';

export class SqlHomepageLinkRepository implements HomepageLinkRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    listHomepageLinks(
        section?: HomepageLinkSection,
    ): Promise<HomepageLinkRecord[]> {
        return section
            ? queryAll<HomepageLinkRecord>(
                  this.database,
                  `SELECT * FROM homepage_links WHERE section=?
                   ORDER BY display_order, id`,
                  [section],
              )
            : queryAll<HomepageLinkRecord>(
                  this.database,
                  'SELECT * FROM homepage_links ORDER BY section, display_order, id',
              );
    }

    findHomepageLinkById(id: string): Promise<HomepageLinkRecord | null> {
        return queryOne(
            this.database,
            'SELECT * FROM homepage_links WHERE id=?',
            [id],
        );
    }

    async createHomepageLink(
        input: NewHomepageLinkInput,
    ): Promise<HomepageLinkRecord> {
        const created = await queryOne<HomepageLinkRecord>(
            this.database,
            `INSERT INTO homepage_links
                (id, section, title, description, href, icon, accent,
                 display_order, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(display_order) + 1, 0), ?, ?
             FROM homepage_links WHERE section=?
             RETURNING *`,
            [
                input.id,
                input.section,
                input.title,
                input.description,
                input.href,
                input.icon,
                input.accent,
                input.createdAt,
                input.createdAt,
                input.section,
            ],
        );
        if (!created) throw new Error('Homepage link insert failed');
        return created;
    }

    updateHomepageLink(
        id: string,
        input: HomepageLinkUpdateInput,
    ): Promise<HomepageLinkRecord | null> {
        return queryOne<HomepageLinkRecord>(
            this.database,
            `UPDATE homepage_links
             SET title=?, description=?, href=?, icon=?, accent=?, updated_at=?
             WHERE id=? RETURNING *`,
            [
                input.title,
                input.description,
                input.href,
                input.icon,
                input.accent,
                input.updatedAt,
                id,
            ],
        );
    }

    async deleteHomepageLink(id: string): Promise<boolean> {
        const result = await executeSql(
            this.database,
            'DELETE FROM homepage_links WHERE id=?',
            [id],
        );
        return result.meta.changes === 1;
    }

    async reorderHomepageLinks(
        section: HomepageLinkSection,
        ids: readonly string[],
        updatedAt: number,
    ): Promise<boolean> {
        if (!ids.length) {
            return (await this.listHomepageLinks(section)).length === 0;
        }
        const positions = ids.map(() => 'WHEN ? THEN ?').join(' ');
        const placeholders = ids.map(() => '?').join(', ');
        const values: unknown[] = [];
        ids.forEach((id, index) => values.push(id, index));
        values.push(updatedAt, section, ...ids, section, ids.length);
        const result = await executeSql(
            this.database,
            `UPDATE homepage_links
             SET display_order=CASE id ${positions} ELSE display_order END,
                 updated_at=?
             WHERE section=? AND id IN (${placeholders})
               AND (SELECT COUNT(*) FROM homepage_links WHERE section=?)=?`,
            values,
        );
        return result.meta.changes === ids.length;
    }
}
