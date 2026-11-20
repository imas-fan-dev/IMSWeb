import type { AdminNamecardTagBlocklistMutation } from '@imsweb/contracts/namecards';
import type { NamecardTagJsonRequestContext } from '@/domains/admin/namecard-tags/request';
import { tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleCreateBlocklist(
    c: NamecardTagJsonRequestContext<{ pattern: string; isRegex: boolean }>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const body = c.req.valid('json');
        const item = await namecardTagRepository(c).createBlocklist({
            pattern: body.pattern,
            isRegex: body.isRegex,
            now: new Date().toISOString(),
        });
        return {
            status: 201,
            body: { success: true, item } satisfies AdminNamecardTagBlocklistMutation,
        };
    });
}
