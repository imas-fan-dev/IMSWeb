import type { AppEnvironment } from '@/app';
import type { LiveScheduleQuery } from '@/domains/content/live-schedule/request';
import type { LiveScheduleListResponse } from '@/domains/content/live-schedule/response';
import { getLiveSchedule } from '@/domains/content/live-schedule/live-schedule-service';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListLiveSchedule(
    c: ValidatedRequestContext<AppEnvironment, 'query', LiveScheduleQuery>
): Promise<Response> {
    const { months } = c.req.valid('query');
    const fetcher = c.get('services').fetch || globalThis.fetch;
    const events = await getLiveSchedule(fetcher, months);
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(events satisfies LiveScheduleListResponse);
}
