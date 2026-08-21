import type { Context } from 'hono';
import type { ObjectStorage } from '@/ports/object-storage';
import { objectReadResponse } from '@/utils/http/object-read-response';

export type MediaTextResponse =
    | { body: 'Bad Request'; status: 400 }
    | { body: 'Not Found'; status: 404 };

export interface MediaAuthorizationErrorResponse {
    message: string;
}

export interface MediaObjectReadResponse {
    key: string;
    visibility: 'private' | 'public';
}

export const PUBLIC_UPLOAD_BAD_REQUEST_RESPONSE = {
    body: 'Bad Request',
    status: 400
} as const satisfies MediaTextResponse;

export const MEDIA_NOT_FOUND_RESPONSE = {
    body: 'Not Found',
    status: 404
} as const satisfies MediaTextResponse;

export function mediaTextResponse(
    c: Context,
    response: MediaTextResponse
): Response {
    return c.text(response.body, response.status);
}

export function mediaObjectReadResponse(
    request: Request,
    storage: ObjectStorage,
    response: MediaObjectReadResponse
): Promise<Response | null> {
    const isPrivate = response.visibility === 'private';
    return objectReadResponse(request, storage, response.key, isPrivate ? {
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie, Authorization'
    } : {
        'Cache-Control': 'public, max-age=31536000, immutable'
    });
}
