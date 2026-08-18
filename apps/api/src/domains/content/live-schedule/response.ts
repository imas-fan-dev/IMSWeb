import type { LiveEvent } from '@imsweb/contracts/live';

export type LiveScheduleEventResponse = LiveEvent;
export type LiveScheduleListResponse = LiveScheduleEventResponse[];

export interface LiveScheduleErrorResponse {
    error: string;
}

export function liveScheduleErrorResponse(message: string) {
    return { error: message } satisfies LiveScheduleErrorResponse;
}
