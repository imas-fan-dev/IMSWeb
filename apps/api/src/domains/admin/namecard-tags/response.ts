import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export function numberParam(value: string): number {
    return Number(value);
}

export async function tagRepositoryResponse<Body>(
    c: Context<AppEnvironment>,
    operation: () => Promise<{ status: number; body: Body }>
): Promise<Response> {
    try {
        const { status, body } = await operation();
        return c.json(body, status as 200 | 201);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Namecard tag admin operation failed', error);
        return c.json(
            {
                success: false,
                code: status === 409 ? 'NAMECARD_TAG_CONFLICT' : 'NAMECARD_TAG_INVALID',
                message: messageFromError(error),
            },
            status as 400 | 404 | 409 | 500
        );
    }
}
