import type { AppEnvironment } from '@/app';
import { toAdminNamecardDiffResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleGetAdminNamecardDiff(
    c: ValidatedRequestContext<AppEnvironment, 'param', { id: number }>
): Promise<Response> {
    const { id } = c.req.valid('param');
    try {
        const diff = await namecardRepository(c).findCardDiff(id);
        if (!diff) return c.json({ success: false }, 404);
        return c.json(toAdminNamecardDiffResponse(diff));
    } catch (error) {
        console.error('[admin-namecard-diff]', error);
        return c.json({ success: false }, 500);
    }
}
