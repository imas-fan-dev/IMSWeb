import type {
    AdminStationMessageListQuery as AdminStationMessageListQueryWire,
    AdminStationMessageRecipientQuery as AdminStationMessageRecipientQueryWire,
    AdminStationMessageSendRequest
} from '@imsweb/contracts/platform/admin-station-messages';
import {
    ADMIN_STATION_MESSAGE_MAX_LEAD_MS,
    ADMIN_STATION_MESSAGE_MIN_LEAD_MS
} from '@imsweb/contracts/platform/admin-station-messages/runtime';

export const ADMIN_STATION_MESSAGE_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_STATION_MESSAGE_MAX_PAGE_SIZE = 50;

export interface AdminStationMessagePageQuery {
    page: number;
    pageSize: number;
}

export interface AdminStationMessageRecipientQuery extends AdminStationMessagePageQuery {
    query: string | null;
}

function positiveInteger(value: string | undefined): number | null {
    if (value === undefined) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function pageQuery(value: { page?: string; pageSize?: string }): AdminStationMessagePageQuery {
    const requestedPageSize =
        positiveInteger(value.pageSize) ?? ADMIN_STATION_MESSAGE_DEFAULT_PAGE_SIZE;
    return {
        page: positiveInteger(value.page) ?? 1,
        pageSize: Math.min(requestedPageSize, ADMIN_STATION_MESSAGE_MAX_PAGE_SIZE)
    };
}

export function normalizeAdminStationMessageListQuery(
    value: AdminStationMessageListQueryWire
): AdminStationMessagePageQuery {
    return pageQuery(value);
}

export function normalizeAdminStationMessageRecipientQuery(
    value: AdminStationMessageRecipientQueryWire
): AdminStationMessageRecipientQuery {
    const query = value.query?.trim() ?? '';
    return { ...pageQuery(value), query: query.length > 0 ? query : null };
}

export class AdminStationMessageRequestError extends Error {
    override readonly name = 'AdminStationMessageRequestError';

    constructor(
        readonly code: string,
        message: string
    ) {
        super(message);
    }
}

const LOCAL_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function localMinute(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
        date.getHours()
    )}:${pad(date.getMinutes())}`;
}

export interface NormalizedStationMessageSend {
    title: string;
    body: string;
    audience: 'all' | 'selected';
    accountIds: readonly string[];
    forwardEmail: boolean;
    scheduledAt: number | null;
}

/**
 * 把请求体收敛成派发器可以直接用的形状。
 *
 * 收件人一致性、定时窗口和「草稿是否过期」都在这里判定：契约只校验字段形态，
 * 业务规则放在 domain 层，错误码由 handler 转成 4xx。
 */
export function normalizeAdminStationMessageSend(
    input: AdminStationMessageSendRequest,
    now: number = Date.now()
): NormalizedStationMessageSend {
    if (input.audience === 'selected' && (input.accountIds?.length ?? 0) === 0) {
        throw new AdminStationMessageRequestError(
            'STATION_MESSAGE_RECIPIENTS_REQUIRED',
            '选择指定用户时必须至少勾选一位收件人'
        );
    }
    const scheduledAt = input.scheduledAt;
    if (scheduledAt !== null) {
        if (scheduledAt < now + ADMIN_STATION_MESSAGE_MIN_LEAD_MS) {
            throw new AdminStationMessageRequestError(
                'STATION_MESSAGE_SCHEDULE_TOO_SOON',
                '定时发送时间至少要比当前时间晚一分钟'
            );
        }
        if (scheduledAt > now + ADMIN_STATION_MESSAGE_MAX_LEAD_MS) {
            throw new AdminStationMessageRequestError(
                'STATION_MESSAGE_SCHEDULE_TOO_FAR',
                '定时发送时间不能超过 90 天'
            );
        }
        if (
            input.scheduledLocalMinute !== undefined &&
            LOCAL_MINUTE_PATTERN.test(input.scheduledLocalMinute) &&
            input.scheduledLocalMinute !== localMinute(scheduledAt)
        ) {
            throw new AdminStationMessageRequestError(
                'STATION_MESSAGE_SCHEDULE_STALE',
                '定时时间已经变化，请重新选择发送时间'
            );
        }
    }
    return {
        title: input.title,
        body: input.body,
        audience: input.audience,
        accountIds: input.audience === 'selected' ? (input.accountIds ?? []) : [],
        forwardEmail: input.forwardEmail,
        scheduledAt
    };
}
