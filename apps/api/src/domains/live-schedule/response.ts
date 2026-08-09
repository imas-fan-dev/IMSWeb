export interface LiveScheduleEventResponse {
    id: string;
    year: number;
    month: number;
    day: number;
    title: string;
    time: string;
    location: string;
    detailUrl?: string;
    franchises: string[];
    brandCodes: string[];
}

export type LiveScheduleListResponse = LiveScheduleEventResponse[];

export interface LiveScheduleErrorResponse {
    error: string;
}

export function liveScheduleErrorResponse(message: string) {
    return { error: message } satisfies LiveScheduleErrorResponse;
}
