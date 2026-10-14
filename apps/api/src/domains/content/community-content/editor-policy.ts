import type { MiddlewareHandler } from 'hono';
import type { AppEnvironment } from '@/app';
import type { CommunityContentErrorResponse } from '@imsweb/contracts/community-content';
export const communityContentEditors: MiddlewareHandler<
    AppEnvironment
> = async (c, next) => {
    const dept = c.get('backofficeUser')?.dept;
    if (dept !== 'op' && dept !== 'editor')
        return c.json(
            {
                error: '无权管理制作人社区',
            } satisfies CommunityContentErrorResponse,
            403,
        );
    await next();
};
