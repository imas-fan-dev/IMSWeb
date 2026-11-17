import type {
    NamecardNotification,
    NamecardNotificationListResponse,
    NamecardNotificationReadResponse
} from '@imsweb/contracts/fudaba/card-claims';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { namecardRepository } from '@/middleware/hono-context';

/** 站内信列表：审核结果、认领结果与后续的管理员群发都走这里。 */
export async function handleListNamecardNotifications(
    c: Context<AppEnvironment>
): Promise<Response> {
    const accountId = c.get('platformUser')!.id;
    const { items, unread } = await namecardRepository(c).listNamecardNotifications(accountId, 50);
    return c.json({
        items: items.map((row) => ({
            id: row.id,
            kind: row.kind as NamecardNotification['kind'],
            cardNumber: row.card_number === null ? null : Number(row.card_number),
            title: row.title,
            body: row.body,
            readAt: row.read_at === null ? null : new Date(row.read_at).toISOString(),
            createdAt: new Date(row.created_at).toISOString()
        })),
        unread
    } satisfies NamecardNotificationListResponse);
}

/** 标记已读：`ids` 缺省即「全部标为已读」。 */
export async function handleMarkNamecardNotificationsRead(
    c: Context<AppEnvironment>
): Promise<Response> {
    const accountId = c.get('platformUser')!.id;
    const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
        ? body.ids.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : null;
    const updated = await namecardRepository(c).markNamecardNotificationsRead(accountId, ids);
    return c.json({
        success: true as const,
        updated
    } satisfies NamecardNotificationReadResponse);
}
