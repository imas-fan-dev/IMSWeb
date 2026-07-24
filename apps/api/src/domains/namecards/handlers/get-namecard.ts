import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { namecardRepository } from '@/middleware/hono-context';
import { positiveInteger } from '@/utils/validation/number';

export async function handleGetNamecard(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id'));
    if (!id) return c.json({});
    try {
        const card = await namecardRepository(c).findApprovedCardMedia(id);
        return c.json(card ? { image1_url: card.image1_url, image2_url: card.image2_url } : {});
    } catch {
        return c.json({});
    }
}
