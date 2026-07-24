import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { authenticateCoreRequest } from '@/middleware/hono-auth';
import { getRequestPathSegments } from '@/middleware/static-path-policy';

export function thumbnailDimension(value: string | undefined): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isInteger(parsed) || parsed < 1) return 200;
    return Math.min(parsed, 2000);
}

export function thumbnailKey(value: unknown): { key: string; namecardUrl?: string } | null {
    const url = String(value || '');
    if (!url.startsWith('/') || /[?#]/.test(url)) return null;
    const segments = getRequestPathSegments(url);
    if (!segments || !/\.(?:png|jpe?g|jfif|gif|webp|bmp|avif)$/i.test(segments.at(-1) || '')) return null;
    const lower = segments.map((part) => part.toLowerCase());
    const prefix = lower.slice(0, 3).join('/');
    if (segments.length === 4 && [
        'uploads/news/original', 'uploads/news/thumb', 'uploads/event/original',
        'uploads/event/thumb'
    ].includes(prefix)) return { key: segments.join('/') };
    if (segments.length === 4 && prefix === 'uploads/namecard/original') {
        return { key: segments.join('/'), namecardUrl: `/${segments.join('/')}` };
    }
    if (segments.length === 7 && lower.slice(0, 5).join('/') === 'assets/images/eventchronicle/events/used') {
        return { key: segments.join('/') };
    }
    return null;
}

export function publicUploadKey(pathname: string): string | null {
    const segments = getRequestPathSegments(pathname);
    if (!segments) return null;
    const lower = segments.map((segment) => segment.toLowerCase());
    const fourSegmentPrefix = lower.slice(0, 3).join('/');
    if (segments.length === 4 && [
        'uploads/news/original', 'uploads/news/thumb', 'uploads/event/original',
        'uploads/information'
    ].includes(fourSegmentPrefix)) return segments.join('/');
    if (segments.length === 4 && lower.slice(0, 3).join('/') === 'uploads/information/original') {
        return segments.join('/');
    }
    return null;
}

export async function authorizePrivate(c: Context<AppEnvironment>): Promise<Response | null> {
    const failure = await authenticateCoreRequest(c);
    if (failure) return failure;
    return c.get('user')?.dept === 'op' ? null : c.json({ message: '无权限（仅op可访问）' }, 403);
}
