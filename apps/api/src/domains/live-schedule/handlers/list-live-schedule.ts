import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    getLiveSchedule,
    isLiveScheduleMonth
} from '@/domains/live-schedule/live-schedule-service';

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

export async function handleListLiveSchedule(c: Context<AppEnvironment>) {
    const months = (c.req.query('months') || currentMonth())
        .split(',')
        .map((month) => month.trim())
        .filter(Boolean);
    if (
        months.length === 0 ||
        months.length > 2 ||
        months.some((month) => !isLiveScheduleMonth(month))
    ) {
        return c.json({ error: 'Invalid live schedule month' }, 400);
    }
    const fetcher = c.get('services').fetch || globalThis.fetch;
    const events = await getLiveSchedule(fetcher, months);
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(events);
}
