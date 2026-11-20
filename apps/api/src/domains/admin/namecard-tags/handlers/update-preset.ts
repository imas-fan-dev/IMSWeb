import type {
    AdminNamecardTagPresetMutation,
    AdminNamecardTagPresetParams,
    AdminNamecardTagPresetUpdateRequest,
} from '@imsweb/contracts/namecards';
import type { NamecardTagParamsJsonRequestContext } from '@/domains/admin/namecard-tags/request';
import { numberParam, tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleUpdatePreset(
    c: NamecardTagParamsJsonRequestContext<
        AdminNamecardTagPresetParams,
        AdminNamecardTagPresetUpdateRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const body = c.req.valid('json');
        const preset = await namecardTagRepository(c).updatePreset({
            id: numberParam(id),
            ...(body.name === undefined ? {} : { name: body.name }),
            ...(body.aliases === undefined ? {} : { aliases: body.aliases }),
            now: new Date().toISOString(),
        });
        return {
            status: 200,
            body: { success: true, preset } satisfies AdminNamecardTagPresetMutation,
        };
    });
}
