import { randomUUID } from 'node:crypto';

import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import { queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';
import type {
    NewStationMessageInput,
    StationMessageAudience,
    StationMessageDelivery,
    StationMessageEmailResult,
    StationMessageEmailTarget,
    StationMessageRecord,
    StationMessageRepository,
    StationMessageStatus,
    StationMessageTarget
} from '@/ports/repositories/station-messages';

/** 与 `namecard-notification-repository.ts` 的每账号上限保持一致。 */
const NOTIFICATION_LIMIT = 200;

/** 单个收件人的邮件最多重试次数。 */
const EMAIL_MAX_ATTEMPTS = 3;

const MESSAGE_COLUMNS = `id, sender_admin_id, sender_admin_name, title, body, audience,
       forward_email, scheduled_at, status, recipient_count, delivered_count,
       email_sent_count, email_failed_count, failure_reason, created_at,
       started_at, completed_at`;

interface StationMessageRow {
    id: string;
    sender_admin_id: string;
    sender_admin_name: string;
    title: string;
    body: string;
    audience: string;
    forward_email: boolean;
    scheduled_at: Date | string | null;
    status: string;
    recipient_count: number;
    delivered_count: number;
    email_sent_count: number;
    email_failed_count: number;
    failure_reason: string | null;
    created_at: Date | string;
    started_at: Date | string | null;
    completed_at: Date | string | null;
}

function epoch(value: Date | string | null): number | null {
    if (value === null) return null;
    const time = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

function toRecord(row: StationMessageRow): StationMessageRecord {
    return {
        id: row.id,
        senderAdminId: row.sender_admin_id,
        senderAdminName: row.sender_admin_name,
        title: row.title,
        body: row.body,
        audience: row.audience as StationMessageAudience,
        forwardEmail: row.forward_email,
        scheduledAt: epoch(row.scheduled_at),
        status: row.status as StationMessageStatus,
        recipientCount: Number(row.recipient_count),
        deliveredCount: Number(row.delivered_count),
        emailSentCount: Number(row.email_sent_count),
        emailFailedCount: Number(row.email_failed_count),
        failureReason: row.failure_reason,
        createdAt: epoch(row.created_at) ?? Date.now(),
        startedAt: epoch(row.started_at),
        completedAt: epoch(row.completed_at)
    };
}

function placeholders(count: number): string {
    return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * 群发批次 + 收件人快照的 SQL 实现。
 *
 * 关键点：站内信的「送达」不是新表，而是把 `namecard_notifications` 批量写一遍
 * （`kind='station-message'`），所以读取路径、未读角标、保留策略与审核通知完全一致；
 * 这里只负责批次、定时、审计与邮件转发进度。
 */
export class SqlStationMessageRepository implements StationMessageRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async create(input: NewStationMessageInput): Promise<StationMessageRecord> {
        const id = randomUUID();
        // 立即发送也落成 `scheduled` + `scheduled_at = now`：这样即使进程在
        // 派发过程中掉线，调度器也会把这条再捞起来，不会留下永久的 `sending`。
        const scheduledAt = input.scheduledAt === null ? new Date() : new Date(input.scheduledAt);
        await this.database.transaction(async (database) => {
            await sqlStatement(
                database,
                `INSERT INTO public.station_messages
                     (id, sender_admin_id, sender_admin_name, title, body, audience,
                      forward_email, scheduled_at, status, recipient_count)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
                [
                    id,
                    input.senderAdminId,
                    input.senderAdminName,
                    input.title,
                    input.body,
                    input.audience,
                    input.forwardEmail,
                    scheduledAt,
                    input.audience === 'selected' ? input.accountIds.length : 0
                ]
            ).run();
            if (input.audience === 'selected' && input.accountIds.length > 0) {
                // 只快照真实存在且未删除的账号；没有绑定邮箱的收件人直接跳过邮件。
                await sqlStatement(
                    database,
                    `INSERT INTO public.station_message_recipients
                         (message_id, account_id, email_state)
                     SELECT ?, account.id,
                            CASE WHEN ? AND EXISTS (
                                     SELECT 1
                                       FROM public.platform_email_credentials credential
                                      WHERE credential.account_id = account.id
                                 )
                                 THEN 'pending' ELSE 'skipped' END
                       FROM public.platform_accounts account
                      WHERE account.deleted_at IS NULL
                        AND account.id IN (${placeholders(input.accountIds.length)})
                     ON CONFLICT (message_id, account_id) DO NOTHING`,
                    [id, input.forwardEmail, ...input.accountIds]
                ).run();
            }
        });
        const created = await this.findById(id);
        if (!created) throw new Error(`station message ${id} disappeared after insert`);
        if (input.scheduledAt !== null) return created;
        // 立即发送：不经过调度器，直接派发。
        const dispatched = await this.dispatch(id);
        return dispatched ?? created;
    }

    async findById(id: string): Promise<StationMessageRecord | null> {
        const row = await queryOne<StationMessageRow>(
            this.database,
            `SELECT ${MESSAGE_COLUMNS} FROM public.station_messages WHERE id = ?`,
            [id]
        );
        return row ? toRecord(row) : null;
    }

    async list(query: {
        limit: number;
        offset: number;
    }): Promise<{ messages: StationMessageRecord[]; total: number }> {
        const [rows, total] = await Promise.all([
            queryAll<StationMessageRow>(
                this.database,
                `SELECT ${MESSAGE_COLUMNS}
                   FROM public.station_messages
                  ORDER BY created_at DESC, id DESC
                  LIMIT ? OFFSET ?`,
                [query.limit, query.offset]
            ),
            queryOne<{ count: number }>(
                this.database,
                `SELECT COUNT(*)::int AS count FROM public.station_messages`
            )
        ]);
        return { messages: rows.map(toRecord), total: total?.count ?? 0 };
    }

    async listTargets(query: {
        query?: string;
        limit: number;
        offset: number;
    }): Promise<{ targets: StationMessageTarget[]; total: number }> {
        const search = query.query?.trim() ?? '';
        if (search.length === 0) {
            const [rows, total] = await Promise.all([
                queryAll<{
                    account_id: string;
                    display_name: string | null;
                    email: string | null;
                    status: string;
                }>(
                    this.database,
                    `SELECT account.id AS account_id,
                            profile.display_name,
                            credential.normalized_email AS email,
                            account.status
                       FROM public.platform_accounts account
                       LEFT JOIN public.platform_profiles profile
                              ON profile.account_id = account.id
                       LEFT JOIN public.platform_email_credentials credential
                              ON credential.account_id = account.id
                      WHERE account.deleted_at IS NULL
                      ORDER BY account.created_at DESC, account.id DESC
                      LIMIT ? OFFSET ?`,
                    [query.limit, query.offset]
                ),
                queryOne<{ count: number }>(
                    this.database,
                    `SELECT COUNT(*)::int AS count
                       FROM public.platform_accounts account
                      WHERE account.deleted_at IS NULL`
                )
            ]);
            return {
                targets: rows.map((row) => ({
                    accountId: row.account_id,
                    displayName: row.display_name?.trim() ?? '',
                    email: row.email,
                    status: row.status
                })),
                total: total?.count ?? 0
            };
        }
        const pattern = `%${search}%`;
        const [rows, total] = await Promise.all([
            queryAll<{
                account_id: string;
                display_name: string | null;
                email: string | null;
                status: string;
            }>(
                this.database,
                `SELECT account.id AS account_id,
                        profile.display_name,
                        credential.normalized_email AS email,
                        account.status
                   FROM public.platform_accounts account
                   LEFT JOIN public.platform_profiles profile
                          ON profile.account_id = account.id
                   LEFT JOIN public.platform_email_credentials credential
                          ON credential.account_id = account.id
                  WHERE account.deleted_at IS NULL
                    AND (
                        account.id = ?
                        OR profile.display_name ILIKE ?
                        OR credential.normalized_email ILIKE ?
                    )
                  ORDER BY account.created_at DESC, account.id DESC
                  LIMIT ? OFFSET ?`,
                [search, pattern, pattern, query.limit, query.offset]
            ),
            queryOne<{ count: number }>(
                this.database,
                `SELECT COUNT(*)::int AS count
                   FROM public.platform_accounts account
                   LEFT JOIN public.platform_profiles profile
                          ON profile.account_id = account.id
                   LEFT JOIN public.platform_email_credentials credential
                          ON credential.account_id = account.id
                  WHERE account.deleted_at IS NULL
                    AND (
                        account.id = ?
                        OR profile.display_name ILIKE ?
                        OR credential.normalized_email ILIKE ?
                    )`,
                [search, pattern, pattern]
            )
        ]);
        return {
            targets: rows.map((row) => ({
                accountId: row.account_id,
                displayName: row.display_name?.trim() ?? '',
                email: row.email,
                status: row.status
            })),
            total: total?.count ?? 0
        };
    }

    /** 批次的名册快照：收件人、是否已送达、邮件转发状态。 */
    async listDeliveries(messageId: string): Promise<StationMessageDelivery[]> {
        const rows = await queryAll<{
            account_id: string;
            display_name: string | null;
            email: string | null;
            delivered_at: Date | string | null;
            email_state: string;
        }>(
            this.database,
            `SELECT recipient.account_id,
                    profile.display_name,
                    credential.normalized_email AS email,
                    recipient.delivered_at,
                    recipient.email_state
               FROM public.station_message_recipients recipient
               LEFT JOIN public.platform_profiles profile
                      ON profile.account_id = recipient.account_id
               LEFT JOIN public.platform_email_credentials credential
                      ON credential.account_id = recipient.account_id
              WHERE recipient.message_id = ?
              ORDER BY recipient.account_id ASC`,
            [messageId]
        );
        return rows.map((row) => ({
            accountId: row.account_id,
            displayName: row.display_name?.trim() ?? null,
            email: row.email,
            delivered: row.delivered_at !== null,
            emailState: row.email_state as StationMessageDelivery['emailState']
        }));
    }

    async cancel(id: string): Promise<StationMessageRecord | null> {
        const result = await sqlStatement(
            this.database,
            `UPDATE public.station_messages
                SET status = 'canceled', completed_at = CURRENT_TIMESTAMP
              WHERE id = ? AND status = 'scheduled'`,
            [id]
        ).run();
        // Only a pending schedule can be cancelled; anything else is not this call's business.
        if ((result.meta.changes ?? 0) === 0) return null;
        return this.findById(id);
    }

    /** 调度器入口：领取单条到期批次并派发。 */
    async dispatchDue(): Promise<StationMessageRecord | null> {
        const due = await queryOne<{ id: string }>(
            this.database,
            `SELECT id
               FROM public.station_messages
              WHERE (status = 'scheduled' AND scheduled_at IS NOT NULL
                     AND scheduled_at <= CURRENT_TIMESTAMP)
                 OR (status = 'sending'
                     AND started_at IS NOT NULL
                     AND started_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
              ORDER BY scheduled_at NULLS FIRST
              LIMIT 1`
        );
        if (!due) return null;
        return this.dispatch(due.id);
    }

    /**
     * 派发一个批次：快照收件人（`all`）、写入站内信、按每账号上限裁剪、更新计数。
     * 整个派发在一个事务里，`status` 不会停留在 `sending`。
     */
    private async dispatch(id: string): Promise<StationMessageRecord | null> {
        return this.database.transaction(async (database) => {
            const row = await this.lockPendingRow(database, id);
            if (!row) return null;
            if (row.audience === 'all') {
                await sqlStatement(
                    database,
                    `INSERT INTO public.station_message_recipients
                         (message_id, account_id, email_state)
                     SELECT ?, account.id,
                            CASE WHEN ? AND EXISTS (
                                     SELECT 1
                                       FROM public.platform_email_credentials credential
                                      WHERE credential.account_id = account.id
                                 )
                                 THEN 'pending' ELSE 'skipped' END
                       FROM public.platform_accounts account
                      WHERE account.deleted_at IS NULL
                        AND account.status = 'active'
                     ON CONFLICT (message_id, account_id) DO NOTHING`,
                    [id, row.forward_email]
                ).run();
            }
            await sqlStatement(
                database,
                `INSERT INTO public.namecard_notifications
                     (id, recipient_account_id, kind, card_number, title, body)
                 SELECT gen_random_uuid()::text, recipient.account_id, 'station-message',
                        NULL, ?, ?
                   FROM public.station_message_recipients recipient
                  WHERE recipient.message_id = ?
                    AND recipient.delivered_at IS NULL`,
                [row.title, row.body, id]
            ).run();
            await sqlStatement(
                database,
                `UPDATE public.station_message_recipients
                    SET delivered_at = CURRENT_TIMESTAMP
                  WHERE message_id = ? AND delivered_at IS NULL`,
                [id]
            ).run();
            await this.trimRecipientNotifications(database, id);
            const counts = await queryOne<{ recipients: number; delivered: number }>(
                database,
                `SELECT COUNT(*)::int AS recipients,
                        COUNT(delivered_at)::int AS delivered
                   FROM public.station_message_recipients
                  WHERE message_id = ?`,
                [id]
            );
            await sqlStatement(
                database,
                `UPDATE public.station_messages
                    SET status = 'sent',
                        recipient_count = ?,
                        delivered_count = ?,
                        started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                        completed_at = CURRENT_TIMESTAMP,
                        failure_reason = NULL
                  WHERE id = ?`,
                [counts?.recipients ?? 0, counts?.delivered ?? 0, id]
            ).run();
            const dispatched = await queryOne<StationMessageRow>(
                database,
                `SELECT ${MESSAGE_COLUMNS} FROM public.station_messages WHERE id = ?`,
                [id]
            );
            return dispatched ? toRecord(dispatched) : null;
        });
    }

    /**
     * 把批次从 `scheduled` / 第一次派发的 `sending` 状态锁定为处理中。
     * 已经派发过的批次（`sent`）不会被重复派发。
     */
    private async lockPendingRow(
        database: SqlDatabase,
        id: string
    ): Promise<StationMessageRow | null> {
        const row = await queryOne<StationMessageRow>(
            database,
            `SELECT ${MESSAGE_COLUMNS}
               FROM public.station_messages
              WHERE id = ? AND status IN ('scheduled', 'sending')
              FOR UPDATE SKIP LOCKED`,
            [id]
        );
        if (!row) return null;
        await sqlStatement(
            database,
            `UPDATE public.station_messages
                SET status = 'sending', started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
              WHERE id = ?`,
            [id]
        ).run();
        return row;
    }

    /** 批量写通知后，按每账号 200 条上限裁剪（与单条写入的策略一致）。 */
    private async trimRecipientNotifications(
        database: SqlDatabase,
        messageId: string
    ): Promise<void> {
        await sqlStatement(
            database,
            `DELETE FROM public.namecard_notifications
              WHERE id IN (
                  SELECT ranked.id
                    FROM (
                        SELECT notification.id,
                               row_number() OVER (
                                   PARTITION BY notification.recipient_account_id
                                   ORDER BY notification.created_at DESC,
                                            (notification.read_at IS NOT NULL) ASC,
                                            notification.id DESC
                               ) AS position
                          FROM public.namecard_notifications notification
                         WHERE notification.recipient_account_id IN (
                                   SELECT recipient.account_id
                                     FROM public.station_message_recipients recipient
                                    WHERE recipient.message_id = ?
                               )
                    ) ranked
                   WHERE ranked.position > ?
              )`,
            [messageId, NOTIFICATION_LIMIT]
        ).run();
    }

    async claimEmailTargets(
        messageId: string,
        limit: number
    ): Promise<StationMessageEmailTarget[]> {
        return this.database.transaction(async (database) => {
            const claimed = await queryAll<{ account_id: string; email_attempts: number }>(
                database,
                `UPDATE public.station_message_recipients
                    SET email_attempts = email_attempts + 1
                  WHERE (message_id, account_id) IN (
                      SELECT message_id, account_id
                        FROM public.station_message_recipients
                       WHERE message_id = ?
                         AND email_state = 'pending'
                         AND email_attempts < ?
                       ORDER BY account_id
                       LIMIT ?
                  )
                  RETURNING account_id, email_attempts`,
                [messageId, EMAIL_MAX_ATTEMPTS, limit]
            );
            if (claimed.length === 0) return [];
            const ids = claimed.map((row) => row.account_id);
            const emails = await queryAll<{ account_id: string; normalized_email: string }>(
                database,
                `SELECT account_id, normalized_email
                   FROM public.platform_email_credentials
                  WHERE account_id IN (${placeholders(ids.length)})`,
                ids
            );
            const byAccount = new Map(emails.map((row) => [row.account_id, row.normalized_email]));
            return claimed.flatMap((row) => {
                const email = byAccount.get(row.account_id);
                if (!email) return [];
                return [
                    {
                        accountId: row.account_id,
                        email,
                        attempts: Number(row.email_attempts)
                    }
                ];
            });
        });
    }

    async listPendingEmailMessages(limit: number): Promise<string[]> {
        const rows = await queryAll<{ id: string }>(
            this.database,
            `SELECT DISTINCT message.id
               FROM public.station_messages message
               JOIN public.station_message_recipients recipient
                 ON recipient.message_id = message.id
              WHERE message.forward_email
                AND recipient.email_state = 'pending'
              ORDER BY message.id
              LIMIT ?`,
            [limit]
        );
        return rows.map((row) => row.id);
    }

    async markEmailResult(
        messageId: string,
        accountId: string,
        result: StationMessageEmailResult
    ): Promise<void> {
        await sqlStatement(
            this.database,
            `UPDATE public.station_message_recipients
                SET email_state = CASE WHEN ? THEN email_state ELSE ? END,
                    email_sent_at = CASE
                                        WHEN ? = 'sent' THEN CURRENT_TIMESTAMP
                                        ELSE email_sent_at
                                    END,
                    email_error = CASE
                                      WHEN ? = 'sent' THEN NULL
                                      ELSE ?
                                  END,
                    email_attempts = CASE WHEN ? THEN ? ELSE email_attempts END
              WHERE message_id = ? AND account_id = ?`,
            [
                result.retryable,
                result.state,
                result.state,
                result.state,
                result.error === null ? null : result.error.slice(0, 500),
                result.retryable,
                EMAIL_MAX_ATTEMPTS,
                messageId,
                accountId
            ]
        ).run();
    }

    async completeEmailForwarding(messageId: string): Promise<void> {
        // 重试次数用尽但仍留在 pending 的收件人收敛为 failed，否则它们会一直
        // 把批次挂在「还有待转发」的名单里。
        await sqlStatement(
            this.database,
            `UPDATE public.station_message_recipients
                SET email_state = 'failed'
              WHERE message_id = ?
                AND email_state = 'pending'
                AND email_attempts >= ?`,
            [messageId, EMAIL_MAX_ATTEMPTS]
        ).run();
        await sqlStatement(
            this.database,
            `UPDATE public.station_messages
                SET email_sent_count = (
                        SELECT COUNT(*)::int
                          FROM public.station_message_recipients recipient
                         WHERE recipient.message_id = ? AND recipient.email_state = 'sent'
                    ),
                    email_failed_count = (
                        SELECT COUNT(*)::int
                          FROM public.station_message_recipients recipient
                         WHERE recipient.message_id = ? AND recipient.email_state = 'failed'
                    )
              WHERE id = ?`,
            [messageId, messageId, messageId]
        ).run();
    }
}
