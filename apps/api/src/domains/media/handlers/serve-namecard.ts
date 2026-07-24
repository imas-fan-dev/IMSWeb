import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { authorizePrivate } from '@/domains/media/media-access';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { namecardRepository, services } from '@/middleware/hono-context';

export async function handleServeNamecard(c: Context<AppEnvironment>): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    const url = `/uploads/namecard/original/${c.req.param('filename')}`;
    const card = await namecardRepository(c).findCardByMediaUrl(url);
    const isPrivate = card?.status !== 'approved';
    if (isPrivate) {
        const failure = await authorizePrivate(c);
        if (failure) return failure;
    }
    const response = await objectReadResponse(
        c.req.raw,
        runtime.storage,
        url.replace(/^\/+/, ''),
        isPrivate ? {
            'Cache-Control': 'private, no-store',
            'Vary': 'Cookie, Authorization'
        } : undefined
    );
    return response ?? c.text('Not Found', 404);
}
