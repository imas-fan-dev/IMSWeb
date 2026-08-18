import { parseWikiUpload } from '@/domains/content/wiki/handler-support';
import type { ParsedUpload } from '@/ports/http';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';
import { positiveInteger } from '@/utils/validation/number';
import type {
    WikiEntryKind,
    WikiStoryEntrySubtype
} from '@/ports/repositories';

export interface CreateWikiAgencyRequest {
    code: string;
    name: string;
    color: string;
    bannerTitle: string;
    wikiEnabled: boolean;
}

export interface UpdateWikiAgencyRequest {
    name?: string;
    color?: string;
    bannerTitle?: string;
    wikiEnabled?: boolean;
}

export interface CreateWikiGroupRequest {
    code: string;
    name: string;
    color: string;
}

export interface UpdateWikiGroupRequest {
    code?: string;
    name?: string;
    color?: string;
}

export interface WikiRevisionRequest {
    expectedRevision: number;
}

export interface CreateWikiIdolRequest {
    name: string;
    folderName: string;
    color: string | null;
    textColor: string;
    wikiUrl: string | null;
    imageFit: 'cover' | 'contain';
    wikiEnabled: boolean;
    groupIds: number[];
    entryKind: WikiEntryKind;
    entrySubtype: WikiStoryEntrySubtype | null;
}

export interface UpdateWikiIdolRequest {
    name?: string;
    color?: string | null;
    textColor?: string;
    wikiUrl?: string | null;
    imageFit?: 'cover' | 'contain';
    wikiEnabled?: boolean;
    groupIds: number[];
    entryKind?: WikiEntryKind;
    entrySubtype?: WikiStoryEntrySubtype | null;
}

export interface CreateWikiCategoryRequest {
    name: string;
}

export interface UpdateWikiCategoryRequest {
    agencyId: number;
    idolId: number;
    name: string;
    expectedName: string;
}

export interface DeleteWikiAgencyIconRequest {
    agency: string;
}

export interface DeleteWikiIdolMediaRequest {
    agency: string;
    idol: string;
}

export interface WikiStorySourceRequest {
    upName: string;
    videoTitle: string;
    url: string;
    contentTypeId?: number;
    sourcePlatformId?: number;
}

export interface WikiStorySourcesRequest {
    agency: string;
    idol: string;
    expectedRevision: number;
    sources: WikiStorySourceRequest[];
}

export interface WikiStoryCatalogMutationRequest {
    name: string;
    description: string;
    isActive: boolean;
    iconName?: string;
    homepageUrl?: string;
    expectedRevision?: number;
}

export interface WikiLayoutRequest {
    expectedRevision: number;
    groups: Array<{ id: number; idolIds: number[] }>;
}

export interface WikiBilibiliRequest {
    url: string;
}

export interface DeleteWikiStoryLinkRequest {
    agency: string;
    idol: string;
    expectedRevision: number;
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

function jsonObject(value: unknown): Record<string, unknown> {
    return requestRecord(value, 'Wiki 请求内容无效');
}

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTRY_KINDS = new Set<WikiEntryKind>(['idol', 'unit', 'story', 'other']);
const STORY_ENTRY_SUBTYPES = new Set<WikiStoryEntrySubtype>([
    'main', 'event', 'special', 'other'
]);

function requiredText(value: unknown, label: string, maximumLength = 100): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maximumLength) {
        invalidRequest(`${label}无效`);
    }
    return value.trim();
}

function optionalText(
    value: unknown,
    label: string,
    maximumLength = 100
): string | undefined {
    return value === undefined ? undefined : requiredText(value, label, maximumLength);
}

function slug(value: unknown, label: string): string {
    const normalized = requiredText(value, label).toLowerCase();
    if (!SLUG.test(normalized)) {
        invalidRequest(`${label}只能使用小写字母、数字、下划线和连字符`);
    }
    return normalized;
}

function optionalSlug(value: unknown, label: string): string | undefined {
    return value === undefined ? undefined : slug(value, label);
}

function color(
    value: unknown,
    label: string,
    nullable = false
): string | null {
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || !COLOR.test(value)) {
        invalidRequest(`${label}必须是六位十六进制颜色`);
    }
    return value.toLowerCase();
}

function optionalColor(
    value: unknown,
    label: string,
    nullable = false
): string | null | undefined {
    return value === undefined ? undefined : color(value, label, nullable);
}

function booleanValue(value: unknown, key: string, fallback?: boolean): boolean {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'boolean') invalidRequest(`${key} 必须是布尔值`);
    return value;
}

function optionalBoolean(value: unknown, key: string): boolean | undefined {
    return value === undefined ? undefined : booleanValue(value, key);
}

function revision(value: unknown, key = 'expectedRevision'): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        invalidRequest(`${key} 必须是非负整数`);
    }
    return value;
}

function numericRevision(value: unknown, key = 'expectedRevision'): number {
    const normalized = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(normalized) || normalized < 0) {
        invalidRequest(`${key} 必须是非负整数`);
    }
    return normalized;
}

function positiveId(value: unknown, label: string): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) invalidRequest(`${label} ID 无效`);
    return id;
}

function categoryTargetId(value: unknown, label: string): number {
    const id = Number(String(value ?? ''));
    if (!Number.isSafeInteger(id) || id <= 0) invalidRequest(`${label} ID 无效`);
    return id;
}

function groupIds(value: unknown): number[] {
    if (!Array.isArray(value)) invalidRequest('栏目列表必须是数组');
    const ids = value.map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(ids).size !== ids.length) {
        invalidRequest('栏目列表无效或包含重复项');
    }
    return ids;
}

function optionalHttpUrl(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        invalidRequest('Wiki 链接必须是有效的 HTTP 或 HTTPS 地址');
    }
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > 2048) invalidRequest('Wiki 链接不能超过 2048 个字符');
    try {
        const url = new URL(normalized);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
        return url.href;
    } catch {
        invalidRequest('Wiki 链接必须是有效的 HTTP 或 HTTPS 地址');
    }
}

function optionalUpdateHttpUrl(value: unknown): string | null | undefined {
    return value === undefined ? undefined : optionalHttpUrl(value);
}

function imageFit(value: unknown, fallback?: 'cover' | 'contain') {
    if (value === undefined && fallback) return fallback;
    if (value !== 'cover' && value !== 'contain') {
        invalidRequest('页面图片适配方式无效');
    }
    return value;
}

function optionalImageFit(value: unknown): 'cover' | 'contain' | undefined {
    return value === undefined ? undefined : imageFit(value);
}

function entryKind(value: unknown): WikiEntryKind {
    if (typeof value !== 'string' || !ENTRY_KINDS.has(value as WikiEntryKind)) {
        invalidRequest('内容页类型无效');
    }
    return value as WikiEntryKind;
}

function entrySubtype(value: unknown): WikiStoryEntrySubtype {
    if (typeof value !== 'string' ||
        !STORY_ENTRY_SUBTYPES.has(value as WikiStoryEntrySubtype)) {
        invalidRequest('剧情内容页必须选择剧情类型');
    }
    return value as WikiStoryEntrySubtype;
}

export function validateCreateWikiAgencyRequest(value: unknown): CreateWikiAgencyRequest {
    const body = jsonObject(value);
    const name = requiredText(body.name, '企划名称');
    return {
        code: slug(body.code, '企划代码'),
        name,
        color: color(body.color, '企划颜色')!,
        bannerTitle: body.bannerTitle === undefined
            ? name
            : requiredText(body.bannerTitle, '横幅标题'),
        wikiEnabled: booleanValue(body.wikiEnabled, 'wikiEnabled', true)
    };
}

export function validateUpdateWikiAgencyRequest(value: unknown): UpdateWikiAgencyRequest {
    const body = jsonObject(value);
    return {
        name: optionalText(body.name, '企划名称'),
        color: optionalColor(body.color, '企划颜色') ?? undefined,
        bannerTitle: optionalText(body.bannerTitle, '横幅标题'),
        wikiEnabled: optionalBoolean(body.wikiEnabled, 'wikiEnabled')
    };
}

export function validateCreateWikiGroupRequest(value: unknown): CreateWikiGroupRequest {
    const body = jsonObject(value);
    return {
        code: slug(body.code, '栏目代码'),
        name: requiredText(body.name, '栏目名称'),
        color: color(body.color, '栏目颜色')!
    };
}

export function validateUpdateWikiGroupRequest(value: unknown): UpdateWikiGroupRequest {
    const body = jsonObject(value);
    return {
        code: optionalSlug(body.code, '栏目代码'),
        name: optionalText(body.name, '栏目名称'),
        color: optionalColor(body.color, '栏目颜色') ?? undefined
    };
}

export function validateWikiRevisionRequest(value: unknown): WikiRevisionRequest {
    return { expectedRevision: revision(jsonObject(value).expectedRevision) };
}

export function validateCreateWikiIdolRequest(value: unknown): CreateWikiIdolRequest {
    const body = jsonObject(value);
    const kind = body.entryKind === undefined ? 'idol' : entryKind(body.entryKind);
    const subtype = body.entrySubtype === undefined ? null : body.entrySubtype;
    if (kind !== 'story' && subtype !== null) {
        invalidRequest('只有剧情内容页可以设置剧情类型');
    }
    return {
        name: requiredText(body.name, '内容页名称'),
        folderName: slug(body.folderName, '目录标识'),
        color: body.color === undefined ? null : color(body.color, '内容页颜色', true),
        textColor: body.textColor === undefined
            ? '#ffffff'
            : color(body.textColor, '文字颜色')!,
        wikiUrl: optionalHttpUrl(body.wikiUrl),
        imageFit: imageFit(body.imageFit, 'cover'),
        wikiEnabled: booleanValue(body.wikiEnabled, 'wikiEnabled', true),
        groupIds: groupIds(body.groupIds),
        entryKind: kind,
        entrySubtype: kind === 'story' ? entrySubtype(subtype) : null
    };
}

export function validateUpdateWikiIdolRequest(value: unknown): UpdateWikiIdolRequest {
    const body = jsonObject(value);
    const kind = body.entryKind === undefined ? undefined : entryKind(body.entryKind);
    let subtype: WikiStoryEntrySubtype | null | undefined;
    if (body.entrySubtype === null) subtype = null;
    else if (body.entrySubtype !== undefined) subtype = entrySubtype(body.entrySubtype);
    if (kind !== undefined && kind !== 'story' && subtype !== undefined && subtype !== null) {
        invalidRequest('只有剧情内容页可以设置剧情类型');
    }
    return {
        name: optionalText(body.name, '内容页名称'),
        color: optionalColor(body.color, '内容页颜色', true),
        textColor: optionalColor(body.textColor, '文字颜色') as string | undefined,
        wikiUrl: optionalUpdateHttpUrl(body.wikiUrl),
        imageFit: optionalImageFit(body.imageFit),
        wikiEnabled: optionalBoolean(body.wikiEnabled, 'wikiEnabled'),
        groupIds: groupIds(body.groupIds),
        entryKind: kind,
        entrySubtype: subtype
    };
}

export function validateCreateWikiCategoryRequest(value: unknown): CreateWikiCategoryRequest {
    return { name: requiredText(jsonObject(value).name, '分类名称') };
}

export function validateUpdateWikiCategoryRequest(value: unknown): UpdateWikiCategoryRequest {
    const body = jsonObject(value);
    return {
        agencyId: categoryTargetId(body.agencyId, '企划'),
        idolId: categoryTargetId(body.idolId, '内容页'),
        name: requiredText(body.name, '分类名称'),
        expectedName: requiredText(body.expectedName, '当前分类名称')
    };
}

function textOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function validateDeleteWikiAgencyIconRequest(
    value: unknown
): DeleteWikiAgencyIconRequest {
    return { agency: textOrEmpty(jsonObject(value).agency) };
}

export function validateDeleteWikiIdolMediaRequest(
    value: unknown
): DeleteWikiIdolMediaRequest {
    const body = jsonObject(value);
    return { agency: textOrEmpty(body.agency), idol: textOrEmpty(body.idol) };
}

function optionalCatalogId(value: unknown, label: string): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return positiveId(value, label);
}

export function validateWikiStorySourcesRequest(value: unknown): WikiStorySourcesRequest {
    const body = jsonObject(value);
    if (!Array.isArray(body.sources) || !body.sources.length || body.sources.length > 20) {
        invalidRequest('剧情卡片需要 1 至 20 个来源');
    }
    return {
        agency: requiredText(body.agency, '企划'),
        idol: requiredText(body.idol, '内容页'),
        expectedRevision: revision(body.expectedRevision),
        sources: body.sources.map((source, index) => {
            if (!source || typeof source !== 'object' || Array.isArray(source)) {
                invalidRequest(`第 ${index + 1} 个来源无效`);
            }
            const item = source as Record<string, unknown>;
            return {
                upName: requiredText(item.upName, `第 ${index + 1} 个来源投稿者`),
                videoTitle: requiredText(
                    item.videoTitle,
                    `第 ${index + 1} 个来源标题`,
                    500
                ),
                url: requiredText(item.url, `第 ${index + 1} 个来源链接`, 2048),
                contentTypeId: optionalCatalogId(
                    item.contentTypeId,
                    `第 ${index + 1} 个来源内容类型`
                ),
                sourcePlatformId: optionalCatalogId(
                    item.sourcePlatformId,
                    `第 ${index + 1} 个来源平台`
                )
            };
        })
    };
}

function storyCatalogBase(body: Record<string, unknown>): WikiStoryCatalogMutationRequest {
    return {
        name: requiredText(body.name, '名称', 80),
        description: body.description === undefined || body.description === null
            ? ''
            : typeof body.description === 'string' && body.description.trim().length <= 240
                ? body.description.trim()
                : invalidRequest('说明无效'),
        isActive: catalogActiveValue(body.isActive)
    };
}

function catalogActiveValue(value: unknown): boolean {
    if (value === undefined) return true;
    if (typeof value !== 'boolean') invalidRequest('启用状态无效');
    return value;
}

function iconName(value: unknown): string {
    const normalized = requiredText(value, '图标', 80);
    if (!ICON_NAME.test(normalized)) invalidRequest('图标无效');
    return normalized;
}

function homepageUrl(value: unknown): string {
    const normalized = value === undefined || value === null
        ? ''
        : typeof value === 'string' && value.trim().length <= 2048
            ? value.trim()
            : invalidRequest('主页链接无效');
    if (!normalized) return '';
    try {
        const url = new URL(normalized);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            invalidRequest('主页链接仅支持 HTTP 或 HTTPS');
        }
    } catch (error) {
        if (error instanceof Error && error.message === '主页链接仅支持 HTTP 或 HTTPS') {
            throw error;
        }
        invalidRequest('主页链接无效');
    }
    return normalized;
}

export function validateCreateWikiContentTypeRequest(
    value: unknown
): WikiStoryCatalogMutationRequest {
    const body = jsonObject(value);
    return { ...storyCatalogBase(body), iconName: iconName(body.iconName) };
}

export function validateUpdateWikiContentTypeRequest(
    value: unknown
): WikiStoryCatalogMutationRequest {
    const body = jsonObject(value);
    return {
        ...storyCatalogBase(body),
        iconName: iconName(body.iconName),
        expectedRevision: revision(body.expectedRevision)
    };
}

export function validateCreateWikiSourcePlatformRequest(
    value: unknown
): WikiStoryCatalogMutationRequest {
    const body = jsonObject(value);
    return { ...storyCatalogBase(body), homepageUrl: homepageUrl(body.homepageUrl) };
}

export function validateUpdateWikiSourcePlatformRequest(
    value: unknown
): WikiStoryCatalogMutationRequest {
    const body = jsonObject(value);
    return {
        ...storyCatalogBase(body),
        homepageUrl: homepageUrl(body.homepageUrl),
        expectedRevision: revision(body.expectedRevision)
    };
}

export function validateWikiLayoutRequest(value: unknown): WikiLayoutRequest {
    const body = jsonObject(value);
    if (!Number.isSafeInteger(body.expectedRevision) ||
        Number(body.expectedRevision) < 0 || !Array.isArray(body.groups)) {
        invalidRequest('布局参数无效');
    }
    return {
        expectedRevision: Number(body.expectedRevision),
        groups: body.groups.map((value) => {
            if (!value || typeof value !== 'object') invalidRequest('布局分组无效');
            const group = value as Record<string, unknown>;
            const id = Number(group.id);
            if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(group.idolIds)) {
                invalidRequest('布局分组无效');
            }
            const idolIds = group.idolIds.map(Number);
            if (idolIds.some((idolId) => !Number.isSafeInteger(idolId) || idolId <= 0)) {
                invalidRequest('布局成员无效');
            }
            return { id, idolIds };
        })
    };
}

export function validateWikiBilibiliRequest(value: unknown): WikiBilibiliRequest {
    return { url: textOrEmpty(jsonObject(value).url) };
}

export function wikiIdParams(field: string, label: string) {
    return (value: unknown): WikiIdParams => {
        const params = requestRecord(value, `${label} ID 无效`);
        const id = positiveInteger(params[field]);
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
    request: Request,
    query: WikiStoryLinkQuery
): Promise<DeleteWikiStoryLinkRequest> {
    let body: Record<string, unknown> = {};
    if (request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        const source = await request.text();
        body = source.trim() ? jsonObject(JSON.parse(source)) : {};
    }
    return {
        agency: textOrEmpty(body.agency ?? query.agency),
        idol: textOrEmpty(body.idol ?? query.idol),
        expectedRevision: numericRevision(
            body.expectedRevision ?? query.expectedRevision
        )
    };
}
