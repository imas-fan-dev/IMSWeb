import type { SnapshotPageInfo } from '@imsweb/contracts/common';
import type {
    AdminRecommendationInput,
    AdminRecommendationListInput,
    RecommendationInput,
    RecommendationPageInput,
} from '@imsweb/contracts/news';

export type NewsResponseId = number | string;

export type PublicNewsItemResponse = RecommendationInput;
export type AdminNewsItemResponse = AdminRecommendationInput;

export type PublicNewsListResponse = PublicNewsItemResponse[];

export type NewsPageInfoResponse = SnapshotPageInfo;
export type NewsCursorPageResponse = RecommendationPageInput;

export interface NewsMutationSuccessResponse {
    success: true;
}

export interface NewsMutationErrorResponse {
    success: false;
    msg: string;
}

export type AdminNewsListResponse =
    | AdminRecommendationListInput
    | NewsMutationErrorResponse;
