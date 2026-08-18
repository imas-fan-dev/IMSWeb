import type { SuccessFlag } from '@imsweb/contracts/common';
import type {
    AdminInformationCard,
    AdminInformationIndex,
    InformationAsset,
    InformationCard,
    InformationDetail,
    InformationList,
} from '@imsweb/contracts/information';

export type InformationCardResponse = AdminInformationCard;
export type AdminInformationCardResponse = AdminInformationCard;

export type PublicInformationCardSummaryResponse = InformationCard;
export type PublicInformationCardResponse = InformationDetail['card'];

export type PublicInformationListResponse = InformationList;
export type PublicInformationDetailResponse = InformationDetail;

export type AdminInformationIndexResponse = AdminInformationIndex;

export interface InformationCardMutationResponse {
    success: true;
    card: AdminInformationCardResponse;
}

export type InformationMutationResponse = SuccessFlag;
export type InformationUploadResponse = InformationAsset;

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
