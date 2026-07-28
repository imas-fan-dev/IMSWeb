import type { ImsHonoApp } from '@/app';
import { handleListLiveSchedule } from '@/domains/live-schedule/handlers/list-live-schedule';

export function registerLiveScheduleRoutes(app: ImsHonoApp): void {
    app.get('/api/live-schedule', handleListLiveSchedule);
}
