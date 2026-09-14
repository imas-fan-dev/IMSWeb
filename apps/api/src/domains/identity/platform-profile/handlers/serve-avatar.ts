import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';
import { objectReadResponse } from '@/utils/http/object-read-response';

const AVATAR_RESPONSE_HEADERS = {
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Authorization, Cookie',
} as const;

function avatarNotFoundResponse(request: Request): Response {
    return new Response(request.method === 'HEAD' ? null : 'Not Found', {
        status: 404,
        headers: {
            ...AVATAR_RESPONSE_HEADERS,
            'Content-Type': 'text/plain; charset=UTF-8',
        },
    });
}

export async function handleServePlatformAvatar(
    c: Context<AppEnvironment>
): Promise<Response> {
    const key = c.get('platformAccount')?.profile.avatar_object_key;
    if (!key) return avatarNotFoundResponse(c.req.raw);
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const response = await objectReadResponse(
        c.req.raw,
        storage,
        key,
        AVATAR_RESPONSE_HEADERS,
        { mode: 'proxy' },
    );
    return response ?? avatarNotFoundResponse(c.req.raw);
}
