import type { SuccessFlag } from '@imsweb/contracts/common';
import type { InformationErrorResponse as InformationContractErrorResponse, AdminInformationMutation } from '@imsweb/contracts/information';
import type { output } from '@imsweb/contracts/z';
import type {
    AdminInformationCard,
    AdminInformationIndex,
    InformationCard,
    InformationDetail,
    InformationList,
    informationAssetSchema
} from '@imsweb/contracts/information';

export type InformationCardResponse = AdminInformationCard;
export type AdminInformationCardResponse = AdminInformationCard;

export type PublicInformationCardSummaryResponse = InformationCard;
export type PublicInformationCardResponse = InformationDetail['card'];

export type PublicInformationListResponse = InformationList;
export type PublicInformationDetailResponse = InformationDetail;

export type AdminInformationIndexResponse = AdminInformationIndex;

export type InformationCardMutationResponse = AdminInformationMutation;

export type InformationMutationResponse = SuccessFlag;
export type InformationUploadResponse = output<typeof informationAssetSchema>;

export type InformationErrorResponse = InformationContractErrorResponse;

export interface InformationContentDocumentResponse {
    body: string;
}

export interface InformationContentNotFoundResponse {
    body: '活动内容不存在';
    status: 404;
}
