import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    authorizePrivate,
    thumbnailDimension,
    thumbnailKey
} from '@/domains/media/media-access';
import { namecardRepository, services } from '@/middleware/hono-context';

export async function handleCreateThumbnail(c: Context<AppEnvironment>): Promise<Response> {
    const target = thumbnailKey(c.req.query('url'));
    if (!target) return c.text('Forbidden', 403);
    const runtime = services(c);
    if (!runtime.storage || !runtime.images) throw new Error('Image services unavailable');
    let isPrivate = false;
    if (target.namecardUrl) {
        const card = await namecardRepository(c).findCardByMediaUrl(target.namecardUrl);
        isPrivate = card?.status !== 'approved';
        if (isPrivate) {
            const failure = await authorizePrivate(c);
            if (failure) return failure;
        }
    }
    const source = await runtime.storage.get(target.key);
    if (!source) return c.text('Image not found', 404);
    try {
        const output = await runtime.images.resizeJpeg(
            source.body,
            thumbnailDimension(c.req.query('width')),
            thumbnailDimension(c.req.query('height'))
        );
        return new Response(Uint8Array.from(output).buffer, {
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': String(output.byteLength),
                'Cache-Control': isPrivate
                    ? 'private, no-store'
                    : 'public, max-age=31536000, immutable',
                ...(isPrivate ? { Vary: 'Cookie, Authorization' } : {})
            }
        });
    } catch {
        return c.text('Image not found', 404);
    }
}
