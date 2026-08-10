import type { AppEnvironment } from '@/app';
import { authorizePrivate } from '@/domains/media/media-access';
import type { ThumbnailQueryRequest } from '@/domains/media/request';
import {
    mediaTextResponse,
    thumbnailImageResponse,
    THUMBNAIL_FORBIDDEN_RESPONSE,
    THUMBNAIL_NOT_FOUND_RESPONSE
} from '@/domains/media/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleCreateThumbnail(
    c: ValidatedRequestContext<AppEnvironment, 'query', ThumbnailQueryRequest>
): Promise<Response> {
    const { target, width, height } = c.req.valid('query');
    if (!target) return mediaTextResponse(c, THUMBNAIL_FORBIDDEN_RESPONSE);
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
    if (!source) return mediaTextResponse(c, THUMBNAIL_NOT_FOUND_RESPONSE);
    try {
        const output = await runtime.images.resizeJpeg(source.body, width, height);
        return thumbnailImageResponse({
            body: output,
            visibility: isPrivate ? 'private' : 'public'
        });
    } catch {
        return mediaTextResponse(c, THUMBNAIL_NOT_FOUND_RESPONSE);
    }
}
