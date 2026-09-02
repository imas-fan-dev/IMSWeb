import type {
    EventInput,
    EventRepository,
} from '@/ports/repositories/content';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';

export class SqlEventRepository implements EventRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async insertEvent(input: EventInput): Promise<number> {
        const result = input.operationKey
            ? await queryOne<{ id: number }>(
                  this.database,
                  `INSERT INTO events
                   (title, name, contact, image_url, operation_key, request_fingerprint,
                    publication_state)
                   VALUES (?, ?, ?, ?, ?, ?, 'publishing')
                   ON CONFLICT (operation_key) WHERE operation_key IS NOT NULL
                   DO UPDATE SET operation_key=EXCLUDED.operation_key
                   WHERE events.request_fingerprint=EXCLUDED.request_fingerprint
                   RETURNING id`,
                  [
                      input.title,
                      input.name,
                      input.contact,
                      input.imageUrl,
                      input.operationKey,
                      input.requestFingerprint,
                  ],
              )
            : await queryOne<{ id: number }>(
                  this.database,
                  `INSERT INTO events
                       (title, name, contact, image_url, publication_state)
                   VALUES (?, ?, ?, ?, 'ready') RETURNING id`,
                  [input.title, input.name, input.contact, input.imageUrl],
              );
        if (!result) throw new Error('Event insert did not return an ID');
        return result.id;
    }

    async updateEvent(
        id: number,
        input: EventInput,
        expectedImageUrl: string,
    ): Promise<boolean> {
        const result = await executeSql(
            this.database,
            `UPDATE events
             SET title=?, name=?, contact=?, image_url=?
             WHERE id=? AND image_url=?`,
            [
                input.title,
                input.name,
                input.contact,
                input.imageUrl,
                id,
                expectedImageUrl,
            ],
        );
        return result.meta.changes > 0;
    }

    findEventByOperationKey(
        operationKey: string,
    ): Promise<Record<string, unknown> | null> {
        return queryOne(
            this.database,
            'SELECT * FROM events WHERE operation_key=?',
            [operationKey],
        );
    }

    async markEventReady(id: number, operationKey: string): Promise<boolean> {
        const result = await executeSql(
            this.database,
            `UPDATE events SET publication_state='ready'
             WHERE id=? AND operation_key=? AND publication_state='publishing'`,
            [id, operationKey],
        );
        if (result.meta.changes === 1) return true;
        const current = await this.findEventByOperationKey(operationKey);
        return current?.id === id && current.publication_state === 'ready';
    }

    async countEvents(): Promise<number> {
        const row = await queryOne<{ total: number }>(
            this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total
             FROM events WHERE publication_state='ready'`,
        );
        return row?.total ?? 0;
    }

    listEvents(
        limit: number,
        offset: number,
    ): Promise<Record<string, unknown>[]> {
        return queryAll(
            this.database,
            `SELECT id, title, name, contact, image_url, created_at
             FROM events WHERE publication_state='ready'
             ORDER BY id DESC LIMIT ? OFFSET ?`,
            [limit, offset],
        );
    }

    async findLatestEventId(): Promise<string | null> {
        const row = await queryOne<{ id: string | null }>(
            this.database,
            `SELECT CAST(MAX(id) AS TEXT) AS id
             FROM events WHERE publication_state='ready'`,
        );
        return row?.id ?? null;
    }

    listEventsByCursor(
        limit: number,
        snapshotId: string,
        afterId?: string,
    ): Promise<Record<string, unknown>[]> {
        if (afterId) {
            return queryAll(
                this.database,
                `SELECT id, title, name, contact, image_url, created_at FROM events
                 WHERE publication_state='ready' AND id<=? AND id<?
                 ORDER BY id DESC LIMIT ?`,
                [snapshotId, afterId, limit],
            );
        }
        return queryAll(
            this.database,
            `SELECT id, title, name, contact, image_url, created_at FROM events
             WHERE publication_state='ready' AND id<=?
             ORDER BY id DESC LIMIT ?`,
            [snapshotId, limit],
        );
    }

    findEvent(id: number): Promise<Record<string, unknown> | null> {
        return queryOne(
            this.database,
            `SELECT id, title, name, contact, image_url, created_at FROM events
             WHERE id=? AND publication_state='ready'`,
            [id],
        );
    }

    findEventMedia(id: number): Promise<{ image_url: string } | null> {
        return queryOne(
            this.database,
            'SELECT image_url FROM events WHERE id=?',
            [id],
        );
    }

    async countEventMediaReferences(imageUrl: string): Promise<number> {
        const row = await queryOne<{ count: number }>(
            this.database,
            'SELECT COUNT(*) AS count FROM events WHERE image_url=?',
            [imageUrl],
        );
        return row?.count ?? 0;
    }

    async deleteEvent(id: number): Promise<boolean> {
        const result = await executeSql(
            this.database,
            'DELETE FROM events WHERE id=?',
            [id],
        );
        return result.meta.changes > 0;
    }
}
