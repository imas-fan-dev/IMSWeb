import type {
    AdminNamecardTagPresetList,
    AdminNamecardTagPresetListQuery,
} from '@imsweb/contracts/namecards';
import type { NamecardTagQueryRequestContext } from '@/domains/admin/namecard-tags/request';
import { tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleListPresets(
    c: NamecardTagQueryRequestContext<AdminNamecardTagPresetListQuery>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { q, page, pageSize } = c.req.valid('query');
        const { items, total } = await namecardTagRepository(c).listPresets({
            q: q ?? null,
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
            } satisfies AdminNamecardTagPresetList,
            200
        );
    });
}
