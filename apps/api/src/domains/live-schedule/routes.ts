import type { ImsHonoApp } from '@/app';
import { handleListLiveSchedule } from '@/domains/live-schedule/handlers/list-live-schedule';
import { validateLiveScheduleQuery } from '@/domains/live-schedule/request';
import { liveScheduleErrorResponse } from '@/domains/live-schedule/response';
import { queryValidator } from '@/middleware/request-validation';

export function registerLiveScheduleRoutes(app: ImsHonoApp): void {
    app.get(
        '/api/live-schedule',
        queryValidator(validateLiveScheduleQuery, {
            errorBody: liveScheduleErrorResponse
        }),
        handleListLiveSchedule
    );
}
