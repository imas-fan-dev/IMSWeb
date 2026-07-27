import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { namecardRepository, services } from '@/middleware/hono-context';
import { resolvePublicMediaFields } from '@/utils/storage/public-object-url';
import { positiveInteger } from '@/utils/validation/number';

export async function handleGetNamecard(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id'));
    if (!id) return c.json({});
    try {
        const card = await namecardRepository(c).findApprovedCardMedia(id);
        if (!card) return c.json({});
        const media = { image1_url: card.image1_url, image2_url: card.image2_url };
        const storage = services(c).storage;
        return c.json(storage
            ? await resolvePublicMediaFields(storage, media, ['image1_url', 'image2_url'])
            : media);
    } catch {
        return c.json({});
    }
}
