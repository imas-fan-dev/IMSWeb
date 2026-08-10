import type { ProducerMapSeries } from '@/domains/producer-map/data';

export interface ProducerMapRegionResponse {
    id: string;
    province: string;
    name: string;
    summary: string;
    contact: string;
    linkUrl: string | null;
    imageUrl: string | null;
    series: ProducerMapSeries;
    enabled: boolean;
}

export interface ProducerMapCommunityResponse {
    id: string;
    name: string;
    platform: string;
    region: string | null;
    description: string;
    contact: string;
    linkUrl: string | null;
    imageUrl: string | null;
    series: ProducerMapSeries;
    enabled: boolean;
}

export interface ProducerMapContentResponse {
    version: 1;
    title: string;
    subtitle: string;
    introduction: string;
    directoryTitle: string;
    mapSourceLabel: string;
    mapSourceUrl: string;
    regions: ProducerMapRegionResponse[];
    communities: ProducerMapCommunityResponse[];
    updatedAt: string | null;
}

export type ProducerMapPublicReadResponse = ProducerMapContentResponse;

export interface ProducerMapRevisionResponse {
    content: ProducerMapContentResponse | null;
    revision: string | null;
}

export type ProducerMapAdminReadResponse = ProducerMapRevisionResponse;

export interface ProducerMapUpdateSuccessResponse {
    success: true;
    content: ProducerMapContentResponse;
    revision: string;
}

export interface ProducerMapMutationErrorResponse {
    error: string;
}
