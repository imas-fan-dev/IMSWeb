import type { LiveEvent, LiveScheduleList, LiveScheduleErrorResponse as LiveScheduleContractErrorResponse } from '@imsweb/contracts/live';

export type LiveScheduleEventResponse = LiveEvent;
export type LiveScheduleListResponse = LiveScheduleList;
export type LiveScheduleErrorResponse = LiveScheduleContractErrorResponse;

export function liveScheduleErrorResponse(message: string) {
    return { error: message } satisfies LiveScheduleErrorResponse;
}
