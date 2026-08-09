import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parsePublicUploadPathRequest } from '@/domains/media/request';
import {
    MEDIA_NOT_FOUND_RESPONSE,
    mediaObjectReadResponse,
    mediaTextResponse,
    PUBLIC_UPLOAD_BAD_REQUEST_RESPONSE
} from '@/domains/media/response';
import { services } from '@/middleware/hono-context';

export async function handleServePublicUpload(c: Context<AppEnvironment>): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    const request = parsePublicUploadPathRequest(c.req.url);
    if (!request) return mediaTextResponse(c, PUBLIC_UPLOAD_BAD_REQUEST_RESPONSE);
    const response = await mediaObjectReadResponse(c.req.raw, runtime.storage, {
        key: request.key,
        visibility: 'public'
    });
    return response ?? mediaTextResponse(c, MEDIA_NOT_FOUND_RESPONSE);
}
