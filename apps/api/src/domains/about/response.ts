export interface AboutPersonResponse {
    id: string;
    name: string;
    role: string;
    description: string;
    since: string;
    profileUrl: string | null;
    avatarUrl: string | null;
}

export interface AboutGroupResponse {
    id: string;
    title: string;
    subtitle: string;
    people: AboutPersonResponse[];
}

export interface AboutPageContentResponse {
    version: 1;
    siteName: string;
    siteNameEn: string;
    tagline: string;
    heroImageUrl: string | null;
    heroImageAlt: string;
    heroImageScale: number;
    heroImageOffsetX: number;
    heroImageOffsetY: number;
    accentColorStart: string;
    accentColorEnd: string;
    welcome: string;
    manifesto: string[];
    sinceYear: number;
    overviewTitle: string;
    overview: string[];
    groups: AboutGroupResponse[];
    updatedAt: string | null;
}

export type AboutPublicContentResponse = AboutPageContentResponse;

export interface AboutAdminContentResponse {
    content: AboutPageContentResponse;
    revision: string | null;
}

export interface AboutUpdateSuccessResponse extends AboutAdminContentResponse {
    success: true;
}

export interface AboutMutationErrorResponse {
    error: string;
}

export interface AboutImageUploadSuccessResponse {
    success: true;
    url: string;
}

export type AboutImageUploadResponse =
    | AboutImageUploadSuccessResponse
    | AboutMutationErrorResponse;
