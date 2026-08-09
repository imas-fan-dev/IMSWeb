import type {
    InformationCategory,
    InformationContentType
} from '@/domains/information/data';

export interface InformationCardResponse {
    id: string;
    category: InformationCategory;
    contentType: InformationContentType;
    image: string;
    link: string;
    title: string;
    html?: string;
    updatedAt: string;
}

export interface AdminInformationCardResponse {
    id: string;
    category: InformationCategory;
    contentType: InformationContentType;
    image: string;
    link: string;
    title: string;
    html?: string;
    updatedAt: string;
}

export interface PublicInformationCardSummaryResponse {
    id: string;
    category: InformationCategory;
    contentType: InformationContentType;
    image: string;
    link: string;
    title: string;
    updatedAt: string;
}

export interface PublicInformationCardResponse {
    id: string;
    category: InformationCategory;
    contentType: 'html';
    image: string;
    link: string;
    title: string;
    html: string;
    updatedAt: string;
}

export interface PublicInformationListResponse {
    cards: PublicInformationCardSummaryResponse[];
}

export interface PublicInformationDetailResponse {
    card: PublicInformationCardResponse;
}

export interface AdminInformationIndexResponse {
    version: 1;
    cards: AdminInformationCardResponse[];
    assets: string[];
}

export interface InformationCardMutationResponse {
    success: true;
    card: AdminInformationCardResponse;
}

export interface InformationMutationResponse {
    success: true;
}

export interface InformationUploadResponse {
    success: true;
    url: string;
}

export interface InformationErrorResponse {
    error: string;
}

export interface InformationContentDocumentResponse {
    body: string;
}

export interface InformationContentNotFoundResponse {
    body: '活动内容不存在';
    status: 404;
}
