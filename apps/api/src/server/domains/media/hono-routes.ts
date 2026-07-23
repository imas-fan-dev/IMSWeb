import type { Context } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { authenticateCoreRequest } from '@/middleware/hono-auth';
import { getRequestPathSegments } from '@/shared/static-path-policy';
import { storedObjectResponse } from '@/shared/stored-object-response';
import { coreRepository, services } from '@/shared/hono-utils';

function thumbnailDimension(value: string | undefined): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isInteger(parsed) || parsed < 1) return 200;
    return Math.min(parsed, 2000);
}

function thumbnailKey(value: unknown): { key: string; namecardUrl?: string } | null {
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

function publicUploadKey(pathname: string): string | null {
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

async function authorizePrivate(c: Context<AppEnvironment>): Promise<Response | null> {
    const failure = await authenticateCoreRequest(c);
    if (failure) return failure;
    return c.get('user')?.dept === 'op' ? null : c.json({ message: '无权限（仅op可访问）' }, 403);
}

export function registerMediaRoutes(app: ImsHonoApp): void {
    const servePublicUpload = async (c: Context<AppEnvironment>): Promise<Response> => {
        const runtime = services(c);
        if (!runtime.storage) throw new Error('Object storage unavailable');
        const key = publicUploadKey(new URL(c.req.url).pathname);
        if (!key) return c.text('Bad Request', 400);
        const object = await runtime.storage.get(key);
        if (!object) return c.text('Not Found', 404);
        return storedObjectResponse(c.req.raw, object, {
            'Cache-Control': 'public, max-age=31536000, immutable'
        });
    };
    for (const route of [
        '/uploads/news/original/:filename',
        '/uploads/news/thumb/:filename',
        '/uploads/event/original/:filename',
        '/uploads/information/:filename',
        '/uploads/information/original/:filename'
    ]) {
        app.get(route, servePublicUpload);
        app.on('HEAD', route, servePublicUpload);
    }

    const serveNamecard = async (c: Context<AppEnvironment>): Promise<Response> => {
            const runtime = services(c);
            if (!runtime.storage) throw new Error('Object storage unavailable');
            const url = `/uploads/namecard/original/${c.req.param('filename')}`;
            const card = await coreRepository(c).findCardByMediaUrl(url);
            const isPrivate = card?.status !== 'approved';
            if (isPrivate) {
                const failure = await authorizePrivate(c);
                if (failure) return failure;
            }
            const object = await runtime.storage.get(url.replace(/^\/+/, ''));
            if (!object) return c.text('Not Found', 404);
            return storedObjectResponse(c.req.raw, object, isPrivate ? {
                'Cache-Control': 'private, no-store',
                'Vary': 'Cookie, Authorization'
            } : undefined);
    };
    app.get('/uploads/namecard/original/:filename', serveNamecard);
    app.on('HEAD', '/uploads/namecard/original/:filename', serveNamecard);

    app.get('/api/thumbnail', async (c) => {
        const target = thumbnailKey(c.req.query('url'));
        if (!target) return c.text('Forbidden', 403);
        const runtime = services(c);
        if (!runtime.storage || !runtime.images) throw new Error('Image services unavailable');
        let isPrivate = false;
        if (target.namecardUrl) {
            const card = await coreRepository(c).findCardByMediaUrl(target.namecardUrl);
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
    });
}
