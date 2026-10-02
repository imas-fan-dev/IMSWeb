import type { Context } from 'hono';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { InformationErrorResponse } from '@/domains/content/information/response';

/**
 * 活动资讯后台已由社区帖子接管，保留路由只为把旧后台调用引导到新入口。
 */
export function handleRetiredAdminInformation(c: Context): Response {
    const body: InformationErrorResponse = {
        error: `活动资讯后台已整合至社区帖子，请使用 ${adminApiPath('/community-posts')}`
    };
    return c.json(body satisfies InformationErrorResponse, 410);
}
