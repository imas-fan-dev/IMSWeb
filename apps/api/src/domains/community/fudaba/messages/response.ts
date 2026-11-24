import type { FudabaMessageError } from '@imsweb/contracts/fudaba/messages';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { statusFromError, messageFromError } from '@/utils/http/error-response';
import type {
    FudabaMixedWallResponse,
    FudabaMessage,
    FudabaPublicMessage,
} from '@imsweb/contracts/fudaba/messages';
import type { ObjectStorage } from '@/ports/object-storage';
import type {
    FudabaMixedWallRecord,
    FudabaMessageFailure,
} from '@/ports/repositories/fudaba-messages';
import {
    fudabaPublicOfficeView,
    fudabaPublicPlacedCardView,
} from '@/domains/community/fudaba/directory/response';

export async function mixedWallView(
    storage: ObjectStorage | undefined,
    record: FudabaMixedWallRecord,
): Promise<FudabaMixedWallResponse> {
    return {
        office: await fudabaPublicOfficeView(storage, record.office),
        wall: record.wall,
        items: await Promise.all(
            record.items.map(async (item) =>
                item.kind === 'card'
                    ? {
                          kind: 'card' as const,
                          card: await fudabaPublicPlacedCardView(
                              storage,
                              item.card,
                          ),
                          canMove: item.canMove,
                      }
                    : {
                          kind: 'message' as const,
                          message: publicMessageView(item.message),
                      },
            ),
        ),
        pageInfo: record.pageInfo,
        capabilities: record.capabilities,
    };
}
export function messageFailure(failure: FudabaMessageFailure) {
    const values = {
        forbidden: [403, 'FUDABA_MESSAGE_FORBIDDEN', '没有权限执行此操作'],
        'not-found': [404, 'FUDABA_MESSAGE_NOT_FOUND', '留言不存在或不可访问'],
        closed: [
            409,
            'FUDABA_MESSAGE_CLOSED',
            '支部当前不允许发布、编辑或移动',
        ],
        'not-editable': [
            409,
            'FUDABA_MESSAGE_NOT_EDITABLE',
            '留言当前不可编辑或移动',
        ],
        conflict: [409, 'FUDABA_MESSAGE_CONFLICT', '留言已更新，请重新读取'],
        limited: [429, 'FUDABA_MESSAGE_RATE_LIMITED', '发布间隔须满 10 秒'],
        'idempotency-conflict': [
            409,
            'FUDABA_MESSAGE_IDEMPOTENCY_CONFLICT',
            '提交标识已用于其他内容',
        ],
        gone: [410, 'FUDABA_MESSAGE_GONE', '留言已销毁，不能恢复'],
    } as const;
    const [status, code, message] = values[failure.status];
    return {
        status,
        body: {
            success: false as const,
            code,
            message,
            ...(failure.revision === undefined
                ? {}
                : { revision: failure.revision }),
            ...(failure.retryAfter === undefined
                ? {}
                : { retryAfter: failure.retryAfter }),
        },
    };
}

export function publicMessageView(message: FudabaMessage): FudabaPublicMessage {
    return {
        id: message.id,
        office: {
            id: message.office.id,
            slug: message.office.slug,
            name: message.office.name,
            isOpen: message.office.isOpen,
        },
        authorName: message.authorName,
        content: message.content,
        color: message.color,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        placement: message.placement,
        capabilities: {
            canEdit: message.capabilities.canEdit,
            canMove: message.capabilities.canMove,
            canDestroy: message.capabilities.canDestroy,
        },
    };
}

export type MessageContext = Context<AppEnvironment>;
export function respondMessageFailure(
    c: MessageContext,
    result: FudabaMessageFailure,
): Response {
    const value = messageFailure(result);
    if (result.retryAfter !== undefined)
        c.header('Retry-After', String(result.retryAfter));
    return c.json(value.body satisfies FudabaMessageError, value.status);
}
export async function withMessageResponse(
    c: MessageContext,
    operation: () => Promise<Response>,
): Promise<Response> {
    try {
        return await operation();
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500)
            console.error('Fudaba message operation failed', {
                name: error instanceof Error ? error.name : 'unknown',
            });
        return c.json(
            {
                success: false,
                code:
                    status >= 500
                        ? 'FUDABA_MESSAGE_FAILED'
                        : 'FUDABA_MESSAGE_INVALID',
                message:
                    status >= 500
                        ? '留言操作暂时失败，请重试'
                        : messageFromError(error),
            },
            status >= 500 ? 500 : 400,
        );
    }
}

export function messageWriteCapabilities(
    message: FudabaMessage,
    enabled: boolean,
): FudabaMessage {
    if (enabled) return message;
    return {
        ...message,
        capabilities: {
            ...message.capabilities,
            canEdit: false,
            canMove: false,
            canDestroy: false,
            canModerateOffice: false,
        },
    };
}
