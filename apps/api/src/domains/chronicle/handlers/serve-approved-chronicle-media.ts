import type { AppEnvironment } from '@/app';
import type { ChronicleMediaParams } from '@/domains/chronicle/request';
import type { ChronicleApprovedMediaResponse } from '@/domains/chronicle/response';
import {
    chroniclePrefix
} from '@/domains/chronicle/chronicle-records';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleServeApprovedChronicleMedia(
    c: ValidatedRequestContext<AppEnvironment, 'param', ChronicleMediaParams>
): Promise<Response> {
    const { activityId, filename } = c.req.valid('param');
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const boundary = {
        cacheControl: 'public, max-age=3600',
        notFoundBody: 'Not Found',
        notFoundStatus: 404
    } satisfies ChronicleApprovedMediaResponse;
    const response = await objectReadResponse(
        c.req.raw,
        storage,
        chroniclePrefix('used', activityId, filename),
        { 'Cache-Control': boundary.cacheControl }
    );
    return response ?? c.text(boundary.notFoundBody, boundary.notFoundStatus);
}
