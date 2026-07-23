import type {
    AuditLogInput,
    CardMediaRecord,
    CoreRepository,
    EventInput,
    NewsInput,
    PendingCardInput,
    UserRecord
} from '@/ports/core-repository';

export class D1CoreRepository implements CoreRepository {
    constructor(private readonly database: D1Database) {}

    initialize(): Promise<void> {
        // Schema is deployed only through versioned Wrangler migrations.
        return Promise.resolve();
    }

    close(): Promise<void> {
        return Promise.resolve();
    }

    findUserByUsername(username: string): Promise<UserRecord | null> {
        return this.database.prepare('SELECT * FROM users WHERE username=?').bind(username).first<UserRecord>();
    }

    findUserById(id: number): Promise<UserRecord | null> {
        return this.database.prepare('SELECT * FROM users WHERE id=?').bind(id).first<UserRecord>();
    }

    async insertAuditLog(input: AuditLogInput): Promise<void> {
        await this.database.prepare(
            'INSERT INTO logs (username, producername, action, target, ip, time) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(input.username, input.producername, input.action, input.target, input.ip, input.time).run();
    }

    async listRecentAuditLogs(limit: number): Promise<Record<string, unknown>[]> {
        const result = await this.database.prepare(
            'SELECT * FROM logs ORDER BY id DESC LIMIT ?'
        ).bind(limit).all<Record<string, unknown>>();
        return result.results;
    }

    async listPublicNews(): Promise<Record<string, unknown>[]> {
        const result = await this.database.prepare(
            'SELECT id, title, thumbnail, content, date FROM news ORDER BY id DESC'
        ).all<Record<string, unknown>>();
        return result.results;
    }

    async listAdminNews(): Promise<Record<string, unknown>[]> {
        const result = await this.database.prepare(
            'SELECT * FROM news ORDER BY id DESC'
        ).all<Record<string, unknown>>();
        return result.results;
    }

    async insertNews(input: NewsInput): Promise<number> {
        const imageKey = input.image.replace(/^\/+/, '');
        const thumbnailKey = input.thumbnail.replace(/^\/+/, '');
        const result = await this.database.prepare(
            `INSERT INTO news (title, image, thumbnail, content, date, author)
             SELECT ?, ?, ?, ?, ?, ?
             WHERE (?='' OR EXISTS (
                SELECT 1 FROM object_index oi
                LEFT JOIN upload_operations u ON u.object_id=oi.object_id
                WHERE oi.logical_key=? AND oi.state IN ('pending', 'ready')
                  AND (u.id IS NULL OR (u.logical_key=oi.logical_key AND u.state=oi.state))
             )) AND (?='' OR EXISTS (
                SELECT 1 FROM object_index oi
                LEFT JOIN upload_operations u ON u.object_id=oi.object_id
                WHERE oi.logical_key=? AND oi.state IN ('pending', 'ready')
                  AND (u.id IS NULL OR (u.logical_key=oi.logical_key AND u.state=oi.state))
             ))`
        ).bind(
            input.title, input.image, input.thumbnail, input.content, input.date, input.author,
            imageKey, imageKey, thumbnailKey, thumbnailKey
        ).run();
        if (result.meta.changes !== 1) {
            throw Object.assign(new Error('News media is no longer active'), { status: 409 });
        }
        return result.meta.last_row_id;
    }

    findNewsMedia(id: number): Promise<{ image: string; thumbnail: string } | null> {
        return this.database.prepare('SELECT image, thumbnail FROM news WHERE id=?')
            .bind(id).first<{ image: string; thumbnail: string }>();
    }

    async deleteNews(id: number): Promise<void> {
        await this.database.prepare('DELETE FROM news WHERE id=?').bind(id).run();
    }

    async insertEvent(input: EventInput): Promise<number> {
        const imageKey = input.imageUrl.replace(/^\/+/, '');
        const result = await this.database.prepare(
            `INSERT INTO events (title, name, contact, image_url)
             SELECT ?, ?, ?, ? WHERE EXISTS (
                SELECT 1 FROM object_index oi
                LEFT JOIN upload_operations u ON u.object_id=oi.object_id
                WHERE oi.logical_key=? AND oi.state IN ('pending', 'ready')
                  AND (u.id IS NULL OR (u.logical_key=oi.logical_key AND u.state=oi.state))
             )`
        ).bind(input.title, input.name, input.contact, input.imageUrl, imageKey).run();
        if (result.meta.changes !== 1) {
            throw Object.assign(new Error('Event media is no longer active'), { status: 409 });
        }
        return result.meta.last_row_id;
    }

    async countEvents(): Promise<number> {
        return await this.database.prepare('SELECT COUNT(*) FROM events').first<number>('COUNT(*)') ?? 0;
    }

    async listEvents(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        const result = await this.database.prepare(
            'SELECT * FROM events ORDER BY id DESC LIMIT ? OFFSET ?'
        ).bind(limit, offset).all<Record<string, unknown>>();
        return result.results;
    }

    findEvent(id: number): Promise<Record<string, unknown> | null> {
        return this.database.prepare('SELECT * FROM events WHERE id=?')
            .bind(id).first<Record<string, unknown>>();
    }

    findEventMedia(id: number): Promise<{ image_url: string } | null> {
        return this.database.prepare('SELECT image_url FROM events WHERE id=?')
            .bind(id).first<{ image_url: string }>();
    }

    async deleteEvent(id: number): Promise<boolean> {
        const result = await this.database.prepare('DELETE FROM events WHERE id=?').bind(id).run();
        return result.meta.changes > 0;
    }

    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null> {
        return this.database.prepare('SELECT id FROM cards WHERE hash1=? AND hash2=?')
            .bind(hash1, hash2).first<{ id: number }>();
    }

    async insertPendingCard(input: PendingCardInput): Promise<number> {
        const image1Key = input.image1Url.replace(/^\/+/, '');
        const image2Key = input.image2Url.replace(/^\/+/, '');
        const result = await this.database.prepare(
            `INSERT INTO cards (image1_url, image2_url, hash1, hash2, ip, status)
             SELECT ?, ?, ?, ?, ?, 'pending'
             WHERE EXISTS (
                SELECT 1 FROM object_index oi
                LEFT JOIN upload_operations u ON u.object_id=oi.object_id
                WHERE oi.logical_key=? AND oi.state='ready'
                  AND (u.id IS NULL OR (u.logical_key=oi.logical_key AND u.state='ready'))
             ) AND EXISTS (
                SELECT 1 FROM object_index oi
                LEFT JOIN upload_operations u ON u.object_id=oi.object_id
                WHERE oi.logical_key=? AND oi.state='ready'
                  AND (u.id IS NULL OR (u.logical_key=oi.logical_key AND u.state='ready'))
             )`
        ).bind(
            input.image1Url,
            input.image2Url,
            input.hash1,
            input.hash2,
            input.ip,
            image1Key,
            image2Key
        ).run();
        if (result.meta.changes !== 1) {
            throw Object.assign(new Error('Card media is no longer active'), { status: 409 });
        }
        return result.meta.last_row_id;
    }

    async countApprovedCards(): Promise<number> {
        return await this.database.prepare(
            "SELECT COUNT(*) FROM cards WHERE status='approved'"
        ).first<number>('COUNT(*)') ?? 0;
    }

    async listApprovedCards(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        const result = await this.database.prepare(
            `SELECT id, image1_url, image2_url, status, created_at FROM cards
             WHERE status='approved' ORDER BY id DESC LIMIT ? OFFSET ?`
        ).bind(limit, offset).all<Record<string, unknown>>();
        return result.results;
    }

    findApprovedCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.database.prepare(
            "SELECT id, image1_url, image2_url, status FROM cards WHERE id=? AND status='approved'"
        ).bind(id).first<CardMediaRecord>();
    }

    async listAdminCards(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        const result = await this.database.prepare(
            'SELECT id, image1_url, image2_url, status FROM cards ORDER BY id DESC LIMIT ? OFFSET ?'
        ).bind(limit, offset).all<Record<string, unknown>>();
        return result.results;
    }

    async approveCard(id: number): Promise<void> {
        await this.database.prepare("UPDATE cards SET status='approved' WHERE id=?").bind(id).run();
    }

    findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.database.prepare(
            'SELECT id, image1_url, image2_url, status FROM cards WHERE id=?'
        ).bind(id).first<CardMediaRecord>();
    }

    async deleteCard(id: number): Promise<void> {
        await this.database.prepare('DELETE FROM cards WHERE id=?').bind(id).run();
    }

    findCardByMediaUrl(url: string): Promise<CardMediaRecord | null> {
        return this.database.prepare(
            'SELECT id, image1_url, image2_url, status FROM cards WHERE image1_url=? OR image2_url=? LIMIT 1'
        ).bind(url, url).first<CardMediaRecord>();
    }

    findApprovedCard(id: number): Promise<{ id: number } | null> {
        return this.database.prepare("SELECT id FROM cards WHERE id=? AND status='approved'")
            .bind(id).first<{ id: number }>();
    }

    async listReactions(cardId: number): Promise<Array<{ emoji: string; count: number }>> {
        const result = await this.database.prepare(
            'SELECT emoji, count FROM card_emojis WHERE card_id=? ORDER BY count DESC'
        ).bind(cardId).all<{ emoji: string; count: number }>();
        return result.results;
    }

    async incrementReaction(cardId: number, emoji: string): Promise<void> {
        await this.database.prepare(
            `INSERT INTO card_emojis (card_id, emoji, count) VALUES (?, ?, 1)
             ON CONFLICT(card_id, emoji) DO UPDATE SET count=count+1`
        ).bind(cardId, emoji).run();
    }

    async decrementAndPruneReaction(cardId: number, emoji: string): Promise<void> {
        await this.database.batch([
            this.database.prepare(
                'UPDATE card_emojis SET count=count-1 WHERE card_id=? AND emoji=?'
            ).bind(cardId, emoji),
            this.database.prepare(
                'DELETE FROM card_emojis WHERE card_id=? AND emoji=? AND count<=0'
            ).bind(cardId, emoji)
        ]);
    }
}
