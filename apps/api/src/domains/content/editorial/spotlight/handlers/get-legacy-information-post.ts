import type { LegacyInformationRequestContext } from '@/domains/content/editorial/request';
import type { EditorialLegacyInformationResponse } from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

/** 旧资讯详情页仍在外部流传，这里把旧 ID 翻译成新的社区帖子 ID。 */
export async function handleGetLegacyInformationPost(
    c: LegacyInformationRequestContext
): Promise<Response> {
    const { legacyInformationId } = c.req.valid('param');
    const post = await editorialRepository(c).findLegacyInformationPost(legacyInformationId);
    return c.json(
        { postId: post?.id ?? null } satisfies EditorialLegacyInformationResponse
    );
}
