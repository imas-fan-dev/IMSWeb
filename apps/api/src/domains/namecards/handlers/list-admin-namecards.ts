import type { AppEnvironment } from '@/app';
import type { AdminNamecardListQuery } from '@/domains/namecards/request';
import {
    toAdminNamecardResponse,
    type AdminNamecardListResponse
} from '@/domains/namecards/response';
import { purgeExpiredNamecardSubmissions } from '@/domains/namecards/ttl-purge';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListAdminNamecards(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminNamecardListQuery>
): Promise<Response> {
    const { page } = c.req.valid('query');
    try {
        const repository = namecardRepository(c);
        await purgeExpiredNamecardSubmissions(c);
        const pageSize = 10;
        const [rows, total] = await Promise.all([
            repository.listAdminCards(pageSize, (page - 1) * pageSize),
            repository.countAdminCards()
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
    } catch {
        return c.json({ success: false } satisfies AdminNamecardListResponse);
    }
}
