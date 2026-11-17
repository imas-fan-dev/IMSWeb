import type {
    AdminStationMessageCancelResponse,
    AdminStationMessageDeliveryList,
    AdminStationMessageIdParams,
    AdminStationMessageList,
    AdminStationMessageSendRequest,
    AdminStationMessageSendResponse,
    AdminStationMessageTargetList
} from '@imsweb/contracts/platform/admin-station-messages';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { Context } from 'hono';
import {
    AdminStationMessageRequestError,
    normalizeAdminStationMessageSend,
    type AdminStationMessagePageQuery,
    type AdminStationMessageRecipientQuery
} from '@/domains/admin/station-messages/request';
import { stationMessageRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import type { StationMessageRecord } from '@/ports/repositories/station-messages';

function pageInfo(query: AdminStationMessagePageQuery, total: number) {
    const totalPages = Math.ceil(total / query.pageSize);
    return {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
        hasNextPage: query.page < totalPages
    };
}

function senderOf(c: Context<AppEnvironment>): {
    id: string;
    name: string;
} {
    const claims = c.get('backofficeUser');
    return {
        id: String(claims?.id ?? 0),
        name: (claims?.producername || claims?.username || 'unknown').slice(0, 128)
    };
}

function errorResponse(
    c: Context<AppEnvironment>,
    code: string,
    message: string,
    status: 400 | 404 | 409
): Response {
    return c.json({ success: false as const, code, message }, status);
}

export async function handleListAdminStationMessages(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminStationMessagePageQuery>
): Promise<Response> {
    const query = c.req.valid('query');
    const { messages, total } = await stationMessageRepository(c).list({
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize
    });
    const payload: AdminStationMessageList = {
        success: true,
        messages,
        pageInfo: pageInfo(query, total)
    };
    return c.json(payload);
}

export async function handleListAdminStationMessageRecipients(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminStationMessageRecipientQuery>
): Promise<Response> {
    const query = c.req.valid('query');
    const { targets, total } = await stationMessageRepository(c).listTargets({
        query: query.query ?? undefined,
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize
    });
    const payload: AdminStationMessageTargetList = {
        success: true,
        targets,
        pageInfo: pageInfo(query, total)
    };
    return c.json(payload);
}

export async function handleListAdminStationMessageDeliveries(
    c: ValidatedRequestContext<AppEnvironment, 'param', AdminStationMessageIdParams>
): Promise<Response> {
    const repository = stationMessageRepository(c);
    const id = c.req.valid('param').id;
    const message = await repository.findById(id);
    if (!message) {
        return errorResponse(c, 'STATION_MESSAGE_NOT_FOUND', '通知不存在', 404);
    }
    const deliveries = await repository.listDeliveries(id);
    const payload: AdminStationMessageDeliveryList = { success: true, deliveries };
    return c.json(payload);
}

export async function handleSendAdminStationMessage(
    c: ValidatedRequestContext<AppEnvironment, 'json', AdminStationMessageSendRequest>
): Promise<Response> {
    let input: ReturnType<typeof normalizeAdminStationMessageSend>;
    try {
        input = normalizeAdminStationMessageSend(c.req.valid('json'));
    } catch (error) {
        if (error instanceof AdminStationMessageRequestError) {
            return errorResponse(c, error.code, error.message, 400);
        }
        throw error;
    }
    const sender = senderOf(c);
    const message = await stationMessageRepository(c).create({
        senderAdminId: sender.id,
        senderAdminName: sender.name,
        title: input.title,
        body: input.body,
        audience: input.audience,
        accountIds: input.accountIds,
        forwardEmail: input.forwardEmail,
        scheduledAt: input.scheduledAt
    });
    await writeAudit(
        c,
        input.scheduledAt === null ? '发送通知' : '定时发送通知',
        `${input.title} · ${message.id}`
    );
    const payload: AdminStationMessageSendResponse = { success: true, message };
    return c.json(payload);
}

export async function handleCancelAdminStationMessage(
    c: ValidatedRequestContext<AppEnvironment, 'param', AdminStationMessageIdParams>
): Promise<Response> {
    const repository = stationMessageRepository(c);
    const id = c.req.valid('param').id;
    const before: StationMessageRecord | null = await repository.findById(id);
    if (!before) {
        return errorResponse(c, 'STATION_MESSAGE_NOT_FOUND', '通知不存在', 404);
    }
    if (before.status !== 'scheduled') {
        return errorResponse(
            c,
            'STATION_MESSAGE_NOT_CANCELABLE',
            '只有待发送的定时通知可以取消',
            409
        );
    }
    const message = await repository.cancel(id);
    if (!message) {
        return errorResponse(c, 'STATION_MESSAGE_NOT_FOUND', '通知不存在', 404);
    }
    await writeAudit(c, '取消定时通知', `${message.title} · ${id}`);
    const payload: AdminStationMessageCancelResponse = { success: true, message };
    return c.json(payload);
}
