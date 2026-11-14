import type { SnapshotPageInfo } from '@imsweb/contracts/common';
import type {
    AdminRecommendation,
    AdminRecommendationList,
    Recommendation,
    RecommendationPage,
    RecommendationResponse,
    NewsMutationErrorResponse as NewsMutationContractErrorResponse,
    NewsMutationSuccess,
} from '@imsweb/contracts/news';

export type NewsResponseId = number | string;

export type PublicNewsItemResponse = Recommendation;
export type AdminNewsItemResponse = AdminRecommendation;

export type PublicNewsListResponse = RecommendationResponse;

export type NewsPageInfoResponse = SnapshotPageInfo;
export type NewsCursorPageResponse = RecommendationPage;
export type NewsMutationSuccessResponse = NewsMutationSuccess;
export type NewsMutationErrorResponse = NewsMutationContractErrorResponse;
export type AdminNewsListResponse = AdminRecommendationList | NewsMutationErrorResponse;
