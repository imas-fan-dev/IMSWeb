import type {
    AdminNamecardTagPromoteRequest,
    AdminNamecardTagPromoteResponse,
} from '@imsweb/contracts/namecards';
import type { NamecardTagJsonRequestContext } from '@/domains/admin/namecard-tags/request';
import { tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handlePromoteFreeTag(
    c: NamecardTagJsonRequestContext<AdminNamecardTagPromoteRequest>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const body = c.req.valid('json');
        const preset = await namecardTagRepository(c).promoteFreeTag({
            name: body.name,
            ...(body.presetName === undefined ? {} : { presetName: body.presetName }),
            aliases: body.aliases,
            now: new Date().toISOString(),
        });
        return c.json(
            { success: true, preset } satisfies AdminNamecardTagPromoteResponse,
            201
        );
    });
}
