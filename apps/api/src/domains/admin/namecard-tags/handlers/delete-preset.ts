import type {
    AdminNamecardTagPresetDelete,
    AdminNamecardTagPresetParams,
} from '@imsweb/contracts/namecards';
import type { NamecardTagParamsRequestContext } from '@/domains/admin/namecard-tags/request';
import { numberParam, tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleDeletePreset(
    c: NamecardTagParamsRequestContext<AdminNamecardTagPresetParams>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const deleted = await namecardTagRepository(c).deletePreset(numberParam(id));
        if (!deleted) {
            throw Object.assign(new Error('预设标签不存在'), { status: 404 });
        }
        return {
            status: 200,
            body: { success: true, id: numberParam(id) } satisfies AdminNamecardTagPresetDelete,
        };
    });
}
