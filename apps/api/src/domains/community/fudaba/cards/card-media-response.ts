import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import { services } from '@/middleware/hono-context';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { readSizedCardPage } from '@/domains/community/fudaba/cards/artwork-store';

export interface CardMediaResponseOptions {
    key: string;
    width?: string;
    cacheControl: string;
    /** Cache header used when the `?w` variant is generated. */
    sizedCacheControl?: string;
    vary?: string;
    mode?: 'redirect' | 'proxy';
    notFound?: string;
}

/**
 * Shared delivery for one namecard page object.
 *
 * Key resolution stays with the caller (public/owner/admin have different
 * access rules); sizing, cache headers and redirect/proxy behavior live here.
 */
export async function respondCardMedia(
    c: Context<AppEnvironment>,
    options: CardMediaResponseOptions
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { key, width, cacheControl, sizedCacheControl, vary, mode, notFound } =
        options;
    if (width) {
        const sized = await readSizedCardPage(
            { storage, images: services(c).images },
            { key, width: Number(width) }
        );
        if (!sized) return c.text(notFound ?? NAMECARD_MEDIA_NOT_FOUND, 404);
        const bytes = sized.body.slice();
        const headers: Record<string, string> = {
            'Content-Type': sized.contentType,
            'Cache-Control': sizedCacheControl ?? cacheControl
        };
        if (vary) headers.Vary = vary;
        return c.body(bytes.buffer as ArrayBuffer, 200, headers);
    }
    const headers: Record<string, string> = { 'Cache-Control': cacheControl };
    if (vary) headers.Vary = vary;
    const response = await objectReadResponse(
        c.req.raw,
        storage,
        key,
        headers,
        { mode: mode ?? 'redirect' }
    );
    return response ?? c.text(notFound ?? NAMECARD_MEDIA_NOT_FOUND, 404);
}
