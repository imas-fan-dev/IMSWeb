import type {
    AdminNamecardTagBlocklistMutation,
    AdminNamecardTagBlocklistParams,
    AdminNamecardTagBlocklistUpdateRequest,
} from '@imsweb/contracts/namecards';
import type { NamecardTagParamsJsonRequestContext } from '@/domains/admin/namecard-tags/request';
import { numberParam, tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleUpdateBlocklist(
    c: NamecardTagParamsJsonRequestContext<
        AdminNamecardTagBlocklistParams,
        AdminNamecardTagBlocklistUpdateRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const body = c.req.valid('json');
        const item = await namecardTagRepository(c).updateBlocklist({
            id: numberParam(id),
            pattern: body.pattern,
            isRegex: body.isRegex,
        });
        if (!item) {
            throw Object.assign(new Error('屏蔽词不存在'), { status: 404 });
        }
        return {
            status: 200,
            body: { success: true, item } satisfies AdminNamecardTagBlocklistMutation,
        };
    });
}
