import type { AdminNamecardTagBlockedMatchList } from '@imsweb/contracts/namecards';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleListBlockedMatches(
    c: Context<AppEnvironment>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => ({
        status: 200,
        body: {
            success: true,
            items: await namecardTagRepository(c).listBlockedMatches(),
        } satisfies AdminNamecardTagBlockedMatchList,
    }));
}
