import type { AdminNamecardTagFreeList, AdminNamecardTagFreeQuery } from '@imsweb/contracts/namecards';
import type { NamecardTagQueryRequestContext } from '@/domains/admin/namecard-tags/request';
import { tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleListFreeTags(
    c: NamecardTagQueryRequestContext<AdminNamecardTagFreeQuery>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { q, sort, page, pageSize } = c.req.valid('query');
        const { items, total } = await namecardTagRepository(c).listFree({
            q: q ?? null,
            sort,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
        const totalPages = Math.ceil(total / pageSize);
        return c.json(
            {
                success: true,
                items,
                pageInfo: {
                    page,
                    pageSize,
                    total,
                    totalPages,
                    hasNextPage: page < totalPages,
                },
            } satisfies AdminNamecardTagFreeList,
            200
        );
    });
}
