import type {
    AdminNamecardTagPresetMergeRequest,
    AdminNamecardTagPresetMutation,
    AdminNamecardTagPresetParams,
} from '@imsweb/contracts/namecards';
import type { NamecardTagParamsJsonRequestContext } from '@/domains/admin/namecard-tags/request';
import { numberParam, tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleMergeFreeTag(
    c: NamecardTagParamsJsonRequestContext<
        AdminNamecardTagPresetParams,
        AdminNamecardTagPresetMergeRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const preset = await namecardTagRepository(c).mergeFreeTag({
            id: numberParam(id),
            name: c.req.valid('json').name,
            now: new Date().toISOString(),
        });
        return c.json(
            { success: true, preset } satisfies AdminNamecardTagPresetMutation,
            200
        );
    });
}
