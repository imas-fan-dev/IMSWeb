import type { AppEnvironment } from '@/app';
import { saveCommunityContent } from '@/domains/content/community-content/content-store';
import type { CommunityContentUpdateRequest } from '@/domains/content/community-content/data';
import type {
    CommunityContentMutationErrorResponse,
    CommunityContentUpdateSuccessResponse,
} from '@/domains/content/community-content/response';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleUpdateCommunityContent(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        CommunityContentUpdateRequest
    >,
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    try {
        const payload = c.req.valid('json');
        const result = await saveCommunityContent(
            storage,
            payload.content,
            payload.revision,
        );
        await writeAudit(c, '更新制作人社区', result.content.title);
        return c.json({
            success: true,
            ...result,
        } satisfies CommunityContentUpdateSuccessResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500)
            console.error('Failed to update community content', error);
        return c.json(
            {
                error:
                    status >= 500
                        ? '制作人社区保存失败'
                        : messageFromError(error),
            } satisfies CommunityContentMutationErrorResponse,
            status as 400 | 409 | 500,
        );
    }
}
