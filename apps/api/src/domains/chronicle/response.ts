export interface ChronicleActivityResponse {
    id: string;
    title: string;
    date: string;
    location: string;
    images: string[];
}

export interface ChronicleActivitySummaryResponse {
    id: string;
    title: string;
    date: string;
    location: string;
    cover: string | null;
}

export type ChronicleActivityListResponse = ChronicleActivitySummaryResponse[];

export interface PendingChronicleMediaItemResponse {
    filename: string;
    url: string;
    uploader?: string;
    time?: string;
}

export interface PendingChronicleMediaListResponse {
    [activityId: string]: PendingChronicleMediaItemResponse[];
}

export interface UsedChronicleMediaItemResponse {
    filename: string;
    url: string;
}

export interface UsedChronicleMediaListResponse {
    [activityId: string]: UsedChronicleMediaItemResponse[];
}

export interface ChronicleMutationResponse {
    success: true;
}

export interface ChronicleUploadResponse {
    success: true;
    count: number;
}

export interface ChronicleErrorResponse {
    error: string;
}

export interface ChronicleUploadErrorResponse {
    success: false;
    error: string;
}

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
