import type {
    AdminNamecardTagPresetCreateRequest,
    AdminNamecardTagPresetMutation,
} from '@imsweb/contracts/namecards';
import type { NamecardTagJsonRequestContext } from '@/domains/admin/namecard-tags/request';
import { tagRepositoryResponse } from '@/domains/admin/namecard-tags/response';
import { namecardTagRepository } from '@/middleware/hono-context';

export async function handleCreatePreset(
    c: NamecardTagJsonRequestContext<AdminNamecardTagPresetCreateRequest>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const body = c.req.valid('json');
        const preset = await namecardTagRepository(c).createPreset({
            name: body.name,
            aliases: body.aliases,
            now: new Date().toISOString(),
        });
        return {
            status: 201,
            body: { success: true, preset } satisfies AdminNamecardTagPresetMutation,
        };
    });
}
