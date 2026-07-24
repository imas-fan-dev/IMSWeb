import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    chroniclePrefix,
    safeChronicleSegment
} from '@/domains/chronicle/chronicle-records';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { services } from '@/middleware/hono-context';

export async function handleServeApprovedChronicleMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const activityId = safeChronicleSegment(c.req.param('activityId'), 'activityId');
    const filename = safeChronicleSegment(c.req.param('filename'), 'filename');
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const response = await objectReadResponse(
        c.req.raw,
        storage,
        chroniclePrefix('used', activityId, filename),
        { 'Cache-Control': 'public, max-age=3600' }
    );
    return response ?? c.text('Not Found', 404);
}
