import { liveScheduleQuerySchema } from '@imsweb/contracts/live';
import { apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleListLiveSchedule } from '@/domains/content/live-schedule/handlers/list-live-schedule';
import { validateLiveScheduleQuery } from '@/domains/content/live-schedule/request';
import { liveScheduleErrorResponse } from '@/domains/content/live-schedule/response';
import { querySchemaValidator } from '@/middleware/request-validation';

export function registerLiveScheduleRoutes(app: ImsHonoApp): void {
    app.get(
        apiPath('/live-schedule'),
        querySchemaValidator(liveScheduleQuerySchema, {
            errorBody: liveScheduleErrorResponse
        }, validateLiveScheduleQuery),
        handleListLiveSchedule
    );
}
