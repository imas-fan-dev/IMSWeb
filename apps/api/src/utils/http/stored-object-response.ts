import type { StoredObject } from '@/ports/object-storage';

export function parseRange(
    value: string | null,
    size: number
): { start: number; end: number } | null | 'invalid' {
    if (!value) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
    if (!match || (!match[1] && !match[2])) return 'invalid';
    let start: number;
    let end: number;
    if (!match[1]) {
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid';
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
        return 'invalid';
    }
    return { start, end: Math.min(end, size - 1) };
}

export function storedObjectResponse(request: Request, object: StoredObject, extraHeaders?: HeadersInit): Response {
    const headers = new Headers(extraHeaders);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Type', object.contentType);
    headers.set('ETag', object.etag);
    if (object.uploadedAt) headers.set('Last-Modified', object.uploadedAt.toUTCString());
    const range = parseRange(request.headers.get('range'), object.size);
    if (range === 'invalid') {
        headers.set('Content-Range', `bytes */${object.size}`);
        return new Response(null, { status: 416, headers });
    }
    if (range) {
        const length = range.end - range.start + 1;
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${object.size}`);
        headers.set('Content-Length', String(length));
        const body = request.method === 'HEAD' ? null : object.body.slice(range.start, range.end + 1);
        return new Response(body ? Uint8Array.from(body).buffer : null, { status: 206, headers });
    }
    headers.set('Content-Length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : Uint8Array.from(object.body).buffer, { status: 200, headers });
}
