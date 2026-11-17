import type { AppEnvironment } from '@/app';
import type { NamecardContributorsQuery } from '@/domains/community/namecards/request';
import type { NamecardContributorsResponse } from '@/domains/community/namecards/response';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListNamecardContributors(
    c: ValidatedRequestContext<AppEnvironment, 'query', NamecardContributorsQuery>,
): Promise<Response> {
    const { page, limit } = c.req.valid('query');
    const repository = services(c).fudaba;
    const result = repository
        ? await repository.listNamecardContributors({ page, pageSize: limit })
        : { items: [], total: 0 };
    const totalPages = Math.ceil(result.total / limit);
    return c.json({
        contributors: result.items.map((contributor) => ({
            accountId: contributor.account_id,
            displayName: contributor.display_name,
            points: contributor.points,
            cards: contributor.cards,
        })),
        pageInfo: {
            page,
            pageSize: limit,
            total: result.total,
            totalPages,
            hasNextPage: page < totalPages,
        },
    } satisfies NamecardContributorsResponse);
}
