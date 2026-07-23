import type {
    AuditLogInput,
    CardMediaRecord,
    CoreRepository,
    EventInput,
    NewsInput,
    PendingCardInput,
    UserRecord
} from '@/ports/core-repository';
import { SqliteConnection } from '@/adapters/node/sqlite-connection';

export class SqliteCoreRepository implements CoreRepository {
    private initialized?: Promise<void>;

    constructor(private readonly connection: SqliteConnection) {}

    initialize(): Promise<void> {
        this.initialized ??= this.connection.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT, image TEXT, thumbnail TEXT, content TEXT, date TEXT, author TEXT
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE, password TEXT, dept TEXT, producername TEXT
            );
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT, producername TEXT, action TEXT, target TEXT, ip TEXT, time TEXT
            );
            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image1_url TEXT NOT NULL, image2_url TEXT NOT NULL,
                hash1 TEXT, hash2 TEXT, ip TEXT,
                status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title VARCHAR(255), name VARCHAR(100), contact VARCHAR(100),
                image_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS card_emojis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                card_id INTEGER NOT NULL, emoji TEXT NOT NULL, count INTEGER DEFAULT 1,
                UNIQUE(card_id, emoji),
                FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
            );
        `);
        return this.initialized;
    }

    close(): Promise<void> {
        return this.connection.close();
    }

    findUserByUsername(username: string): Promise<UserRecord | null> {
        return this.connection.get<UserRecord>('SELECT * FROM users WHERE username=?', [username]);
    }

    findUserById(id: number): Promise<UserRecord | null> {
        return this.connection.get<UserRecord>('SELECT * FROM users WHERE id=?', [id]);
    }

    async insertAuditLog(input: AuditLogInput): Promise<void> {
        await this.connection.run(
            'INSERT INTO logs (username, producername, action, target, ip, time) VALUES (?, ?, ?, ?, ?, ?)',
            [input.username, input.producername, input.action, input.target, input.ip, input.time]
        );
    }

    listRecentAuditLogs(limit: number): Promise<Record<string, unknown>[]> {
        return this.connection.all('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit]);
    }

    listPublicNews(): Promise<Record<string, unknown>[]> {
        return this.connection.all(
            'SELECT id, title, thumbnail, content, date FROM news ORDER BY id DESC'
        );
    }

    listAdminNews(): Promise<Record<string, unknown>[]> {
        return this.connection.all('SELECT * FROM news ORDER BY id DESC');
    }

    async insertNews(input: NewsInput): Promise<number> {
        const result = await this.connection.run(
            'INSERT INTO news (title, image, thumbnail, content, date, author) VALUES (?, ?, ?, ?, ?, ?)',
            [input.title, input.image, input.thumbnail, input.content, input.date, input.author]
        );
        return result.lastID;
    }

    findNewsMedia(id: number): Promise<{ image: string; thumbnail: string } | null> {
        return this.connection.get('SELECT image, thumbnail FROM news WHERE id=?', [id]);
    }

    async deleteNews(id: number): Promise<void> {
        await this.connection.run('DELETE FROM news WHERE id=?', [id]);
    }

    async insertEvent(input: EventInput): Promise<number> {
        const result = await this.connection.run(
            'INSERT INTO events (title, name, contact, image_url) VALUES (?, ?, ?, ?)',
            [input.title, input.name, input.contact, input.imageUrl]
        );
        return result.lastID;
    }

    async countEvents(): Promise<number> {
        const row = await this.connection.get<{ total: number }>('SELECT COUNT(*) AS total FROM events');
        return row?.total ?? 0;
    }

    listEvents(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        return this.connection.all(
            'SELECT * FROM events ORDER BY id DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
    }

    findEvent(id: number): Promise<Record<string, unknown> | null> {
        return this.connection.get('SELECT * FROM events WHERE id=?', [id]);
    }

    findEventMedia(id: number): Promise<{ image_url: string } | null> {
        return this.connection.get('SELECT image_url FROM events WHERE id=?', [id]);
    }

    async deleteEvent(id: number): Promise<boolean> {
        const result = await this.connection.run('DELETE FROM events WHERE id=?', [id]);
        return result.changes > 0;
    }

    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null> {
        return this.connection.get('SELECT id FROM cards WHERE hash1=? AND hash2=?', [hash1, hash2]);
    }

    async insertPendingCard(input: PendingCardInput): Promise<number> {
        const result = await this.connection.run(
            `INSERT INTO cards (image1_url, image2_url, hash1, hash2, ip, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [input.image1Url, input.image2Url, input.hash1, input.hash2, input.ip]
        );
        return result.lastID;
    }

    async countApprovedCards(): Promise<number> {
        const row = await this.connection.get<{ total: number }>(
            "SELECT COUNT(*) AS total FROM cards WHERE status='approved'"
        );
        return row?.total ?? 0;
    }

    listApprovedCards(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        return this.connection.all(
            `SELECT id, image1_url, image2_url, status, created_at FROM cards
             WHERE status='approved' ORDER BY id DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
    }

    findApprovedCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.connection.get(
            "SELECT id, image1_url, image2_url, status FROM cards WHERE id=? AND status='approved'",
            [id]
        );
    }

    listAdminCards(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        return this.connection.all(
            'SELECT id, image1_url, image2_url, status FROM cards ORDER BY id DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
    }

    async approveCard(id: number): Promise<void> {
        await this.connection.run("UPDATE cards SET status='approved' WHERE id=?", [id]);
    }

    findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.connection.get(
            'SELECT id, image1_url, image2_url, status FROM cards WHERE id=?',
            [id]
        );
    }

    async deleteCard(id: number): Promise<void> {
        await this.connection.run('DELETE FROM cards WHERE id=?', [id]);
    }

    findCardByMediaUrl(url: string): Promise<CardMediaRecord | null> {
        return this.connection.get(
            'SELECT id, image1_url, image2_url, status FROM cards WHERE image1_url=? OR image2_url=? LIMIT 1',
            [url, url]
        );
    }

    findApprovedCard(id: number): Promise<{ id: number } | null> {
        return this.connection.get("SELECT id FROM cards WHERE id=? AND status='approved'", [id]);
    }

    listReactions(cardId: number): Promise<Array<{ emoji: string; count: number }>> {
        return this.connection.all(
            'SELECT emoji, count FROM card_emojis WHERE card_id=? ORDER BY count DESC',
            [cardId]
        );
    }

    async incrementReaction(cardId: number, emoji: string): Promise<void> {
        await this.connection.run(
            `INSERT INTO card_emojis (card_id, emoji, count) VALUES (?, ?, 1)
             ON CONFLICT(card_id, emoji) DO UPDATE SET count=count+1`,
            [cardId, emoji]
        );
    }

    async decrementAndPruneReaction(cardId: number, emoji: string): Promise<void> {
        await this.connection.transaction(async () => {
            await this.connection.run(
                'UPDATE card_emojis SET count=count-1 WHERE card_id=? AND emoji=?',
                [cardId, emoji]
            );
            await this.connection.run(
                'DELETE FROM card_emojis WHERE card_id=? AND emoji=? AND count<=0',
                [cardId, emoji]
            );
        });
    }
}
