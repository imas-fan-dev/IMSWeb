import type {
    AdminNamecardTagBlockRequest,
    AdminNamecardTagBlockResult,
} from '@imsweb/contracts/namecards';
import type { NamecardTagJsonRequestContext } from '@/domains/admin/namecard-tags/request';
import { tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleBlockFreeTag(
    c: NamecardTagJsonRequestContext<AdminNamecardTagBlockRequest>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const body = c.req.valid('json');
        const { removed, item } = await namecardTagRepository(c).blockFreeTag({
            name: body.name,
            pattern: body.pattern ?? body.name,
            isRegex: body.isRegex ?? false,
            now: new Date().toISOString(),
        });
        return c.json(
            { success: true, removed, item } satisfies AdminNamecardTagBlockResult,
            200
        );
    });
}
