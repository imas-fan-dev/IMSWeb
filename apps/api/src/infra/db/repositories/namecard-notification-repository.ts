import { randomUUID } from 'node:crypto';

import type { SqlDatabase } from '@/infra/db/sql/database';
import { queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';

/**
 * 通知保留与上限策略（与迁移 `20261024150000_namecard_notifications.sql` 的注释一致）：
 * - 未读通知保留 90 天，已读通知保留 30 天，超期在「读取」时清理；
 * - 每个账号最多 200 条，超限时删除最旧的，`created_at` 相同则优先删除已读的。
 * 这样即便某个账号长期不打开消息页，表也不会无界增长，且用户不会因为一次海量
 * 审核动作就丢掉刚发生的通知。
 */
export const NAMECARD_NOTIFICATION_LIMIT = 200;
export const NAMECARD_NOTIFICATION_UNREAD_DAYS = 90;
export const NAMECARD_NOTIFICATION_READ_DAYS = 30;

export type NamecardNotificationKind =
    | 'card-approved'
    | 'card-rejected'
    | 'card-locked'
    | 'card-unlocked'
    | 'claim-approved'
    | 'claim-rejected'
    | 'station-message';

export interface NamecardNotificationRow {
    id: string;
    kind: string;
    card_number: number | string | null;
    title: string;
    body: string;
    read_at: Date | string | null;
    created_at: Date | string;
}

export interface NewNamecardNotificationInput {
    recipientAccountId: string;
    kind: NamecardNotificationKind;
    cardNumber: number | null;
    title: string;
    body: string;
}

const NOTIFICATION_COLUMNS = 'id, kind, card_number, title, body, read_at, created_at';

/** 事务内直接写入一条通知，并按上限裁剪（供审核处理器复用）。 */
export async function insertNamecardNotification(
    database: SqlDatabase,
    input: NewNamecardNotificationInput
): Promise<string> {
    const id = randomUUID();
    await sqlStatement(
        database,
        `INSERT INTO public.namecard_notifications
             (id, recipient_account_id, kind, card_number, title, body)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, input.recipientAccountId, input.kind, input.cardNumber, input.title, input.body]
    ).run();
    await trimNamecardNotifications(database, input.recipientAccountId);
    return id;
}

/** 只保留每个账号最新的 {@link NAMECARD_NOTIFICATION_LIMIT} 条。 */
export async function trimNamecardNotifications(
    database: SqlDatabase,
    recipientAccountId: string
): Promise<void> {
    await sqlStatement(
        database,
        `DELETE FROM public.namecard_notifications
          WHERE id IN (
              SELECT id
                FROM public.namecard_notifications
               WHERE recipient_account_id = ?
               ORDER BY created_at DESC, (read_at IS NOT NULL) ASC, id DESC
              OFFSET ?
          )`,
        [recipientAccountId, NAMECARD_NOTIFICATION_LIMIT]
    ).run();
}

/** 清理超过保留期的通知（未读 90 天 / 已读 30 天）。 */
export async function pruneExpiredNamecardNotifications(
    database: SqlDatabase,
    recipientAccountId: string
): Promise<void> {
    await sqlStatement(
        database,
        `DELETE FROM public.namecard_notifications
          WHERE recipient_account_id = ?
            AND (
                (read_at IS NULL AND created_at < CURRENT_TIMESTAMP - (? || ' days')::interval)
                OR (read_at IS NOT NULL AND created_at < CURRENT_TIMESTAMP - (? || ' days')::interval)
            )`,
        [
            recipientAccountId,
            String(NAMECARD_NOTIFICATION_UNREAD_DAYS),
            String(NAMECARD_NOTIFICATION_READ_DAYS)
        ]
    ).run();
}

export class SqlNamecardNotificationRepository {
    constructor(private readonly database: SqlDatabase) {}

    async create(input: NewNamecardNotificationInput): Promise<string> {
        return insertNamecardNotification(this.database, input);
    }

    async list(
        recipientAccountId: string,
        limit = 50
    ): Promise<{ items: NamecardNotificationRow[]; unread: number }> {
        await pruneExpiredNamecardNotifications(this.database, recipientAccountId);
        const items = await queryAll<NamecardNotificationRow>(
            this.database,
            `SELECT ${NOTIFICATION_COLUMNS}
               FROM public.namecard_notifications
              WHERE recipient_account_id = ?
              ORDER BY created_at DESC, id DESC
              LIMIT ?`,
            [recipientAccountId, limit]
        );
        const unread = await queryOne<{ count: number }>(
            this.database,
            `SELECT COUNT(*)::int AS count
               FROM public.namecard_notifications
              WHERE recipient_account_id = ? AND read_at IS NULL`,
            [recipientAccountId]
        );
        return { items, unread: unread?.count ?? 0 };
    }

    /** `ids` 为 null 表示「全部标记已读」。返回受影响条数。 */
    async markRead(recipientAccountId: string, ids: readonly string[] | null): Promise<number> {
        if (ids !== null && ids.length === 0) return 0;
        const result = await sqlStatement(
            this.database,
            ids === null
                ? `UPDATE public.namecard_notifications
                      SET read_at = CURRENT_TIMESTAMP
                    WHERE recipient_account_id = ? AND read_at IS NULL`
                : `UPDATE public.namecard_notifications
                      SET read_at = CURRENT_TIMESTAMP
                    WHERE recipient_account_id = ? AND read_at IS NULL
                      AND id IN (${ids.map(() => '?').join(', ')})`,
            ids === null ? [recipientAccountId] : [recipientAccountId, ...ids]
        ).run();
        return result.meta.changes ?? 0;
    }
}
