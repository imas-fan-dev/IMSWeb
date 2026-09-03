import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { EventErrorResponse } from '@/domains/content/events/response';

/** The old event form cannot create records managed by the editorial CMS. */
export function handleRetiredEventMutation(c: Context<AppEnvironment>): Response {
    return c.json(
        { error: '旧活动写入接口已停用，请使用社区文章工作台' } satisfies EventErrorResponse,
        410
    );
}
