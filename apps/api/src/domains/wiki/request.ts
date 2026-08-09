import { parseWikiUpload } from '@/domains/wiki/handler-support';
import type { ParsedUpload } from '@/ports/http';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';
import { canonicalPositiveInteger } from '@/utils/validation/number';

export interface WikiJsonRequest {
    [field: string]: unknown;
}

export interface WikiCatalogMutationRequest extends WikiJsonRequest {
    name?: unknown;
    code?: unknown;
    color?: unknown;
    bannerTitle?: unknown;
    wikiEnabled?: unknown;
    expectedRevision?: unknown;
    groupIds?: unknown;
    entryKind?: unknown;
    entrySubtype?: unknown;
}

export interface WikiCategoryMutationRequest extends WikiJsonRequest {
    agencyId?: unknown;
    idolId?: unknown;
    name?: unknown;
    expectedName?: unknown;
}

export interface WikiDeleteMediaRequest extends WikiJsonRequest {
    agency?: unknown;
    idol?: unknown;
}

export interface WikiStorySourcesRequest extends WikiJsonRequest {
    agency?: unknown;
    idol?: unknown;
    expectedRevision?: unknown;
    sources?: unknown;
}

export interface WikiStoryCatalogMutationRequest extends WikiJsonRequest {
    name?: unknown;
    description?: unknown;
    isActive?: unknown;
    iconName?: unknown;
    homepageUrl?: unknown;
    expectedRevision?: unknown;
}

export interface WikiLayoutRequest extends WikiJsonRequest {
    expectedRevision?: unknown;
    groups?: unknown;
}

export interface WikiBilibiliRequest extends WikiJsonRequest {
    url?: unknown;
}

export interface WikiIdParams {
    id: number;
}

export interface WikiCategoryCreateParams {
    agencyId: number;
    idolId: number;
}

export interface WikiAssetParams {
    asset: string;
}

export interface WikiStoriesQuery {
    agency: string;
    idol: string;
}

export interface WikiCatalogQuery {
    agency: string;
}

export interface WikiStoryLinkQuery extends WikiStoriesQuery {
    expectedRevision: string | undefined;
}

export interface WikiUploadRequest extends ParsedUpload {}
export interface AddWikiStoryRequest extends WikiUploadRequest {}
export interface EditWikiStoryRequest extends WikiUploadRequest {}
export interface DeleteWikiStoryRequest extends WikiUploadRequest {}
export interface DeleteWikiCategoryRequest extends WikiUploadRequest {}
export interface SaveWikiEntityImageRequest extends WikiUploadRequest {}
export interface UploadWikiAgencyIconRequest extends WikiUploadRequest {}
export interface UploadWikiIdolMediaRequest extends WikiUploadRequest {}
export interface CreateWikiStoryCoverAssetRequest extends WikiUploadRequest {}
export interface UpdateWikiStoryCoverAssetRequest extends WikiUploadRequest {}
export interface UpdateWikiStoryCardRequest extends WikiUploadRequest {}

export type WikiValidatedInput<
    Target extends 'json' | 'param' | 'query',
    Output
> = ValidatedRequestInput<Target, Output>;

function jsonObject(value: unknown): WikiJsonRequest {
    return requestRecord(value, 'Wiki 请求内容无效');
}

export function validateWikiCatalogMutationRequest(
    value: unknown
): WikiCatalogMutationRequest {
    return jsonObject(value);
}

export function validateWikiCategoryMutationRequest(
    value: unknown
): WikiCategoryMutationRequest {
    return jsonObject(value);
}

export function validateWikiDeleteMediaRequest(value: unknown): WikiDeleteMediaRequest {
    return jsonObject(value);
}

export function validateWikiStorySourcesRequest(value: unknown): WikiStorySourcesRequest {
    return jsonObject(value);
}

export function validateWikiStoryCatalogMutationRequest(
    value: unknown
): WikiStoryCatalogMutationRequest {
    return jsonObject(value);
}

export function validateWikiLayoutRequest(value: unknown): WikiLayoutRequest {
    return jsonObject(value);
}

export function validateWikiBilibiliRequest(value: unknown): WikiBilibiliRequest {
    return jsonObject(value);
}

export function wikiIdParams(field: string, label: string) {
    return (value: unknown): WikiIdParams => {
        const params = requestRecord(value, `${label} ID 无效`);
        const id = canonicalPositiveInteger(params[field]);
        if (!id) invalidRequest(`${label} ID 无效`);
        return { id };
    };
}

export const validateWikiAgencyIdParams = wikiIdParams('agencyId', '企划');
export const validateWikiGroupIdParams = wikiIdParams('groupId', '栏目');
export const validateWikiIdolIdParams = wikiIdParams('idolId', '内容页');
export const validateWikiCategoryIdParams = wikiIdParams('categoryId', '分类');
export const validateWikiCardIdParams = wikiIdParams('cardId', '卡片');
export const validateWikiStoryIdParams = wikiIdParams('storyId', '剧情来源');
export const validateWikiOptionIdParams = wikiIdParams('optionId', '目录项');
export const validateWikiAssetIdParams = wikiIdParams('assetId', '素材');
export const validateWikiMediaAgencyIdParams = wikiIdParams('agencyId', '媒体实体');
export const validateWikiMediaGroupIdParams = wikiIdParams('groupId', '媒体实体');
export const validateWikiMediaIdolIdParams = wikiIdParams('idolId', '媒体实体');

export function validateWikiCategoryCreateParams(value: unknown): WikiCategoryCreateParams {
    return {
        agencyId: validateWikiAgencyIdParams(value).id,
        idolId: validateWikiIdolIdParams(value).id
    };
}

export function wikiValidationErrorBody(message: string): { status: string; msg: string } {
    return { status: 'error', msg: message };
}

export function validateWikiAssetParams(value: unknown): WikiAssetParams {
    const params = requestRecord(value, 'Wiki 媒体路径无效');
    if (typeof params.asset !== 'string') invalidRequest('Wiki 媒体路径无效');
    return { asset: params.asset };
}

export function validateWikiStoriesQuery(value: unknown): WikiStoriesQuery {
    const query = requestRecord(value, 'Wiki 查询参数无效');
    return {
        agency: typeof query.agency === 'string' ? query.agency.trim() : '',
        idol: typeof query.idol === 'string' ? query.idol.trim() : ''
    };
}

export function validateWikiCatalogQuery(value: unknown): WikiCatalogQuery {
    const query = requestRecord(value, 'Wiki 查询参数无效');
    return { agency: typeof query.agency === 'string' ? query.agency.trim() : '' };
}

export function validateWikiStoryLinkQuery(value: unknown): WikiStoryLinkQuery {
    const query = requestRecord(value, 'Wiki 查询参数无效');
    return {
        ...validateWikiStoriesQuery(query),
        expectedRevision: typeof query.expectedRevision === 'string'
            ? query.expectedRevision
            : undefined
    };
}

async function uploadRequest(
    request: Request,
    services: RuntimeServices
): Promise<WikiUploadRequest> {
    return parseWikiUpload(request, services);
}

export const parseAddWikiStoryRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<AddWikiStoryRequest>;
export const parseEditWikiStoryRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<EditWikiStoryRequest>;
export const parseDeleteWikiStoryRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<DeleteWikiStoryRequest>;
export const parseDeleteWikiCategoryRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<DeleteWikiCategoryRequest>;
export const parseSaveWikiEntityImageRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<SaveWikiEntityImageRequest>;
export const parseUploadWikiAgencyIconRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<UploadWikiAgencyIconRequest>;
export const parseUploadWikiIdolMediaRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<UploadWikiIdolMediaRequest>;
export const parseCreateWikiStoryCoverAssetRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<CreateWikiStoryCoverAssetRequest>;
export const parseUpdateWikiStoryCoverAssetRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<UpdateWikiStoryCoverAssetRequest>;
export const parseUpdateWikiStoryCardRequest = uploadRequest as (
    request: Request,
    services: RuntimeServices
) => Promise<UpdateWikiStoryCardRequest>;

export async function parseDeleteWikiStoryLinkRequest(
    request: Request
): Promise<WikiJsonRequest> {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return {};
    }
    const source = await request.text();
    return source.trim() ? jsonObject(JSON.parse(source)) : {};
}
