import type { AppEnvironment } from '@/app';
import type { AdminNamecardListQuery } from '@/domains/namecards/request';
import {
    toAdminNamecardResponse,
    type AdminNamecardListResponse
} from '@/domains/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListAdminNamecards(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminNamecardListQuery>
): Promise<Response> {
    const { page } = c.req.valid('query');
    try {
        return c.json({
            success: true,
            data: (await namecardRepository(c).listAdminCards(10, (page - 1) * 10))
                .map(toAdminNamecardResponse)
        } satisfies AdminNamecardListResponse);
    } catch {
        return c.json({ success: false } satisfies AdminNamecardListResponse);
    }
}
