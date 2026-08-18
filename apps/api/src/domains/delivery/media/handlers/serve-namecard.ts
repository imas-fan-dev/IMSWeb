import type { AppEnvironment } from '@/app';
import { authorizePrivate } from '@/domains/delivery/media/media-access';
import type { NamecardMediaParams } from '@/domains/delivery/media/request';
import {
    MEDIA_NOT_FOUND_RESPONSE,
    mediaObjectReadResponse,
    mediaTextResponse
} from '@/domains/delivery/media/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleServeNamecard(
    c: ValidatedRequestContext<AppEnvironment, 'param', NamecardMediaParams>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    const { url, key } = c.req.valid('param');
    const card = await namecardRepository(c).findCardByMediaUrl(url);
    const isPrivate = card?.status !== 'approved';
    if (isPrivate) {
        const failure = await authorizePrivate(c);
        if (failure) return failure;
    }
    const response = await mediaObjectReadResponse(
        c.req.raw,
        runtime.storage,
        { key, visibility: isPrivate ? 'private' : 'public' }
    );
    return response ?? mediaTextResponse(c, MEDIA_NOT_FOUND_RESPONSE);
}
