import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { NamecardTagErrorResponse } from '@/domains/community/namecards/response';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export function numberParam(value: string): number {
    return Number(value);
}

/** 管理台标签端点共用:成功响应由各处理器自己 `c.json`,这里只兜业务错误。 */
export async function tagRepositoryResponse(
    c: Context<AppEnvironment>,
    operation: () => Promise<Response>
): Promise<Response> {
    try {
        return await operation();
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Namecard tag admin operation failed', error);
        return c.json(
            {
                success: false,
                code: status === 409 ? 'NAMECARD_TAG_CONFLICT' : 'NAMECARD_TAG_INVALID',
                message: messageFromError(error),
            } satisfies NamecardTagErrorResponse,
            status as 400 | 404 | 409 | 500
        );
    }
}
