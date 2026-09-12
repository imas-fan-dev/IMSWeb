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
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready'
               AND (e.article_id IS NULL OR a.status='published')`,
        );
        return row?.total ?? 0;
    }

    listEvents(
        limit: number,
        offset: number,
    ): Promise<Record<string, unknown>[]> {
        return queryAll(
            this.database,
            `SELECT e.id, COALESCE(a.title, e.title) AS title, e.name, e.contact,
                    COALESCE(a.cover_url, e.image_url) AS image_url, e.created_at,
                    e.kind, e.source_url, COALESCE(a.summary, '') AS summary,
                    e.start_at, e.end_at, e.venue_name, e.event_status,
                    jsonb_build_object(
                        'focalX', COALESCE(a.cover_focal_x, 0.5),
                        'focalY', COALESCE(a.cover_focal_y, 0.5),
                        'zoom', COALESCE(a.cover_zoom, 1)
                    ) AS cover_transform
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready'
               AND (e.article_id IS NULL OR a.status='published')
             ORDER BY e.id DESC LIMIT ? OFFSET ?`,
            [limit, offset],
        );
    }

    async findLatestEventId(): Promise<string | null> {
        const row = await queryOne<{ id: string | null }>(
            this.database,
            `SELECT CAST(MAX(e.id) AS TEXT) AS id
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready'
               AND (e.article_id IS NULL OR a.status='published')`,
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
                `SELECT e.id, COALESCE(a.title, e.title) AS title, e.name, e.contact,
                        COALESCE(a.cover_url, e.image_url) AS image_url, e.created_at,
                        e.kind, e.source_url, COALESCE(a.summary, '') AS summary,
                        e.start_at, e.end_at, e.venue_name, e.event_status,
                        jsonb_build_object(
                            'focalX', COALESCE(a.cover_focal_x, 0.5),
                            'focalY', COALESCE(a.cover_focal_y, 0.5),
                            'zoom', COALESCE(a.cover_zoom, 1)
                        ) AS cover_transform
                 FROM events e LEFT JOIN articles a ON a.id=e.article_id
                 WHERE e.publication_state='ready' AND e.id<=? AND e.id<?
                   AND (e.article_id IS NULL OR a.status='published')
                 ORDER BY e.id DESC LIMIT ?`,
                [snapshotId, afterId, limit],
            );
        }
        return queryAll(
            this.database,
            `SELECT e.id, COALESCE(a.title, e.title) AS title, e.name, e.contact,
                    COALESCE(a.cover_url, e.image_url) AS image_url, e.created_at,
                    e.kind, e.source_url, COALESCE(a.summary, '') AS summary,
                    e.start_at, e.end_at, e.venue_name, e.event_status,
                    jsonb_build_object(
                        'focalX', COALESCE(a.cover_focal_x, 0.5),
                        'focalY', COALESCE(a.cover_focal_y, 0.5),
                        'zoom', COALESCE(a.cover_zoom, 1)
                    ) AS cover_transform
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready' AND e.id<=?
               AND (e.article_id IS NULL OR a.status='published')
             ORDER BY e.id DESC LIMIT ?`,
            [snapshotId, limit],
        );
    }

    findEvent(id: number): Promise<Record<string, unknown> | null> {
        return queryOne(
            this.database,
            `SELECT e.id, COALESCE(a.title, e.title) AS title, e.name, e.contact,
                    COALESCE(a.cover_url, e.image_url) AS image_url, e.created_at,
                    jsonb_build_object(
                        'focalX', COALESCE(a.cover_focal_x, 0.5),
                        'focalY', COALESCE(a.cover_focal_y, 0.5),
                        'zoom', COALESCE(a.cover_zoom, 1)
                    ) AS cover_transform
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.id=? AND e.publication_state='ready'
               AND (e.article_id IS NULL OR a.status='published')`,
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
