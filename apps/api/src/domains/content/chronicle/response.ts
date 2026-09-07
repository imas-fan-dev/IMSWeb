import type {
    ChronicleActivity,
    ChronicleActivityList,
    ChronicleActivitySummary,
    ChronicleErrorResponse as ChronicleContractErrorResponse,
    ChronicleUpload,
    chronicleUploadErrorResponseSchema,
    PendingChronicleMedia,
    UsedChronicleMedia,
} from '@imsweb/contracts/chronicle';
import type { SuccessFlag } from '@imsweb/contracts/common';
import type { output } from '@imsweb/contracts/z';

export type ChronicleActivityResponse = ChronicleActivity;
export type ChronicleActivitySummaryResponse = ChronicleActivitySummary;
export type ChronicleActivityListResponse = ChronicleActivityList;

export type PendingChronicleMediaItemResponse =
    PendingChronicleMedia[string][number];
export type PendingChronicleMediaListResponse = PendingChronicleMedia;

export type UsedChronicleMediaItemResponse = UsedChronicleMedia[string][number];
export type UsedChronicleMediaListResponse = UsedChronicleMedia;

export type ChronicleMutationResponse = SuccessFlag;
export type ChronicleUploadResponse = ChronicleUpload;

export type ChronicleErrorResponse = ChronicleContractErrorResponse;
export type ChronicleUploadErrorResponse = output<typeof chronicleUploadErrorResponseSchema>;

// —— 媒体/重定向边界元数据（非线契约 JSON，属 API 本地响应边界）——

export interface ChronicleApprovedMediaResponse {
    cacheControl: 'public, max-age=3600';
    notFoundBody: 'Not Found';
    notFoundStatus: 404;
}

export interface ChroniclePendingMediaResponse {
    cacheControl: 'private, no-store';
    vary: 'Cookie, Authorization';
    notFoundBody: 'Not Found';
    notFoundStatus: 404;
}

export interface ChronicleAdminRedirectResponse {
    location: '/admin/chronicle';
    status: 301;
}
