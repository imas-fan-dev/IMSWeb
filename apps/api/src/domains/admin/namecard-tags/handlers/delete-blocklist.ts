import type {
    AdminNamecardTagBlocklistDelete,
    AdminNamecardTagBlocklistParams,
} from '@imsweb/contracts/namecards';
import type { NamecardTagParamsRequestContext } from '@/domains/admin/namecard-tags/request';
import { numberParam, tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleDeleteBlocklist(
    c: NamecardTagParamsRequestContext<AdminNamecardTagBlocklistParams>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const deleted = await namecardTagRepository(c).deleteBlocklist(numberParam(id));
        if (!deleted) {
            throw Object.assign(new Error('屏蔽词不存在'), { status: 404 });
        }
        return {
            status: 200,
            body: { success: true, id: numberParam(id) } satisfies AdminNamecardTagBlocklistDelete,
        };
    });
}
