import type { ObjectStorage } from '@/ports/object-storage';
import { storedObjectResponse } from '@/utils/http/stored-object-response';

export async function objectReadResponse(
    request: Request,
    storage: ObjectStorage,
    key: string,
    extraHeaders?: HeadersInit
): Promise<Response | null> {
    if (storage.createReadUrl) {
        const target = await storage.createReadUrl(key, {
            method: request.method === 'HEAD' ? 'HEAD' : 'GET'
        });
        if (!target) return null;
        const headers = new Headers(extraHeaders);
        headers.set('Location', target.url);
        if (target.visibility === 'private') {
            headers.set('Cache-Control', 'private, no-store');
        } else if (!headers.has('Cache-Control')) {
            headers.set('Cache-Control', 'public, max-age=300');
        }
        headers.set('Referrer-Policy', 'no-referrer');
        return new Response(null, { status: 307, headers });
    }
    const object = await storage.get(key);
    return object ? storedObjectResponse(request, object, extraHeaders) : null;
}
