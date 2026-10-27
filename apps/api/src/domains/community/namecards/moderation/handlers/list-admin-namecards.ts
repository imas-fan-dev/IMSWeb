import type { AppEnvironment } from '@/app';
import type { AdminNamecardListQuery } from '@/domains/community/namecards/request';
import {
    toAdminNamecardResponse,
    type AdminNamecardListResponse
} from '@/domains/community/namecards/response';
import { purgeExpiredNamecardSubmissions } from '@/domains/community/fudaba/guest-submissions/ttl-purge';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListAdminNamecards(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminNamecardListQuery>
): Promise<Response> {
    const { page, query, status, origins } = c.req.valid('query');
    const filter = { query, status, origins };
    try {
        const repository = namecardRepository(c);
        await purgeExpiredNamecardSubmissions(c);
        const pageSize = 12;
        const [rows, total] = await Promise.all([
            repository.listAdminCards(pageSize, (page - 1) * pageSize, filter),
            repository.countAdminCards(filter)
        ]);
        const totalPages = Math.ceil(total / pageSize);
        return c.json({
            success: true,
            data: rows.map(toAdminNamecardResponse),
            pageInfo: {
                page,
                pageSize,
                total,
                totalPages,
                hasNextPage: page < totalPages
            }
        } satisfies AdminNamecardListResponse);
    } catch (error) {
        console.error('[admin-namecards]', error);
        return c.json({ success: false } satisfies AdminNamecardListResponse);
    }
}
