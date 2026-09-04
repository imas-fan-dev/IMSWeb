import type {
    ProducerMapAdminSnapshot,
    ProducerMapAdminUpdate,
    ProducerMapCommunity,
    ProducerMapContent,
    ProducerMapImageUpload,
    ProducerMapRegion,
} from '@imsweb/contracts/producer-map';

export type ProducerMapRegionResponse = ProducerMapRegion;
export type ProducerMapCommunityResponse = ProducerMapCommunity;
export type ProducerMapContentResponse = ProducerMapContent;

export type ProducerMapPublicReadResponse = ProducerMapContentResponse;

export type ProducerMapRevisionResponse = ProducerMapAdminSnapshot;
export type ProducerMapAdminReadResponse = ProducerMapRevisionResponse;

export type ProducerMapUpdateSuccessResponse = ProducerMapAdminUpdate;
export type ProducerMapImageUploadSuccessResponse = ProducerMapImageUpload;

export interface ProducerMapMutationErrorResponse {
    error: string;
}
