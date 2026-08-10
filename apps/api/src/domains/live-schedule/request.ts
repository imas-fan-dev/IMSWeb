import { isLiveScheduleMonth } from '@/domains/live-schedule/live-schedule-service';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';

const MAX_REQUESTED_MONTHS = 2;

export interface LiveScheduleQuery {
    months: string[];
}

function currentMonth(): string {
    const japanNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return japanNow.toISOString().slice(0, 7);
}

export function validateLiveScheduleQuery(value: unknown): LiveScheduleQuery {
    const query = requestRecord(value, 'Invalid live schedule month');
    if (query.months !== undefined && typeof query.months !== 'string') {
        invalidRequest('Invalid live schedule month');
    }
    const months = ((query.months as string | undefined) || currentMonth())
        .split(',')
        .map((month) => month.trim())
        .filter(Boolean);
    if (
        months.length === 0 ||
        months.length > MAX_REQUESTED_MONTHS ||
        months.some((month) => !isLiveScheduleMonth(month))
    ) {
        invalidRequest('Invalid live schedule month');
    }
    return { months };
}
