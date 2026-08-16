import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { MediaAuthorizationErrorResponse } from '@/domains/media/response';
import { authenticateBackofficeRequest } from '@/middleware/hono-auth';
import { getRequestPathSegments } from '@/middleware/static-path-policy';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export function publicUploadKey(pathname: string): string | null {
    const segments = getRequestPathSegments(pathname);
    if (!segments) return null;
    const lower = segments.map((segment) => segment.toLowerCase());
    const fourSegmentPrefix = lower.slice(0, 3).join('/');
    if (segments.length === 4 && [
        'uploads/news/original', 'uploads/news/thumb', 'uploads/event/original',
        'uploads/information', 'uploads/about/hero', 'uploads/about/member-avatars'
    ].includes(fourSegmentPrefix)) {
        return publicMediaObjectKey(segments.join('/'));
    }
    if (segments.length === 4 && lower.slice(0, 3).join('/') === 'uploads/information/original') {
        return publicMediaObjectKey(segments.join('/'));
    }
    if (segments.length === 3 && lower.slice(0, 2).join('/') === 'uploads/producer-map') {
        return publicMediaObjectKey(segments.join('/'));
    }
    return null;
}

export async function authorizePrivate(c: Context<AppEnvironment>): Promise<Response | null> {
    const failure = await authenticateBackofficeRequest(c);
    if (failure) return failure;
    return c.get('backofficeUser')?.dept === 'op'
        ? null
        : c.json(
            { message: '无权限（仅op可访问）' } satisfies MediaAuthorizationErrorResponse,
            403
        );
}
