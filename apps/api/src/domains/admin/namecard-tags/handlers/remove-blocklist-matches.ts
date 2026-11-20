import type {
    AdminNamecardTagBlocklistParams,
    AdminNamecardTagBlocklistRemoveMatches,
} from '@imsweb/contracts/namecards';
import type { NamecardTagParamsRequestContext } from '@/domains/admin/namecard-tags/request';
import { numberParam, tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleRemoveBlocklistMatches(
    c: NamecardTagParamsRequestContext<AdminNamecardTagBlocklistParams>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const removed = await namecardTagRepository(c).removeBlocklistMatches(
            numberParam(id)
        );
        return {
            status: 200,
            body: { success: true, removed } satisfies AdminNamecardTagBlocklistRemoveMatches,
        };
    });
}
