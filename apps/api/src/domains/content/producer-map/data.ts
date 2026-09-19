import {
    revisionedContentRequest
} from '@/utils/validation/request-data';

const MAX_REGIONS = 34;
const MAX_COMMUNITIES = 100;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PRODUCER_MAP_PROVINCES = [
    '北京市',
    '天津市',
    '河北省',
    '山西省',
    '内蒙古自治区',
    '辽宁省',
    '吉林省',
    '黑龙江省',
    '上海市',
    '江苏省',
    '浙江省',
    '安徽省',
    '福建省',
    '江西省',
    '山东省',
    '河南省',
    '湖北省',
    '湖南省',
    '广东省',
    '广西壮族自治区',
    '海南省',
    '重庆市',
    '四川省',
    '贵州省',
    '云南省',
    '西藏自治区',
    '陕西省',
    '甘肃省',
    '青海省',
    '宁夏回族自治区',
    '新疆维吾尔自治区',
    '台湾省',
    '香港特别行政区',
    '澳门特别行政区'
] as const;

export const PRODUCER_MAP_SERIES = [
    'all',
    '765',
    'cg',
    'ml',
    'sidem',
    'sc',
    'gakuen'
] as const;

export type ProducerMapSeries = typeof PRODUCER_MAP_SERIES[number];

export interface ProducerMapRegion {
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

export interface ProducerMapCommunity {
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

export interface ProducerMapDraft {
    version: 1;
    title: string;
    subtitle: string;
    introduction: string;
    directoryTitle: string;
    mapSourceLabel: string;
    mapSourceUrl: string;
    regions: ProducerMapRegion[];
    communities: ProducerMapCommunity[];
}

export interface ProducerMapContent extends ProducerMapDraft {
    updatedAt: string | null;
}

export interface ProducerMapUpdateRequest {
    content: ProducerMapDraft;
    revision: string | null;
}

function invalid(message: string): never {
    throw Object.assign(new Error(message), { status: 400 });
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        invalid('制作人地图配置格式无效');
    }
    return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if ((!normalized && !allowEmpty) || normalized.length > maxLength) {
        invalid(`${label}必须为${allowEmpty ? '0' : '1'}-${maxLength}个字符`);
    }
    return normalized;
}

function identifier(value: unknown, label: string): string {
    const normalized = text(value, label, 80);
    if (!ID_PATTERN.test(normalized)) invalid(`${label}必须为小写 kebab-case`);
    return normalized;
}

function optionalUrl(value: unknown, label: string): string | null {
    if (value === null || value === undefined || value === '') return null;
    const normalized = text(value, label, 500);
    if (normalized.startsWith('/') && !normalized.startsWith('//')) {
        if (normalized.includes('\\') || normalized.split('/').includes('..')) {
            invalid(`${label}无效`);
        }
        return normalized;
    }
    try {
        const url = new URL(normalized);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') invalid(`${label}无效`);
    } catch {
        invalid(`${label}无效`);
    }
    return normalized;
}

function externalUrl(value: unknown, label: string): string {
    const normalized = text(value, label, 500);
    try {
        const url = new URL(normalized);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') invalid(`${label}无效`);
    } catch {
        invalid(`${label}无效`);
    }
    return normalized;
}

function series(value: unknown, label: string): ProducerMapSeries {
    if (!PRODUCER_MAP_SERIES.includes(value as ProducerMapSeries)) {
        invalid(`${label}无效`);
    }
    return value as ProducerMapSeries;
}

function enabled(value: unknown, label: string): boolean {
    if (typeof value !== 'boolean') invalid(`${label}必须为布尔值`);
    return value;
}

function province(value: unknown, label: string, allowEmpty = false): string | null {
    if (allowEmpty && (value === null || value === undefined || value === '')) return null;
    const normalized = text(value, label, 40);
    if (!(PRODUCER_MAP_PROVINCES as readonly string[]).includes(normalized)) {
        invalid(`${label}无效`);
    }
    return normalized;
}

function region(value: unknown, index: number): ProducerMapRegion {
    const source = record(value);
    const prefix = `第${index + 1}个地区`;
    return {
        id: identifier(source.id, `${prefix} ID`),
        province: province(source.province, `${prefix}行政区`)!,
        name: text(source.name, `${prefix}名称`, 80),
        summary: text(source.summary, `${prefix}简介`, 1_000, true),
        contact: text(source.contact, `${prefix}联络信息`, 240, true),
        linkUrl: optionalUrl(source.linkUrl, `${prefix}链接`),
        imageUrl: optionalUrl(source.imageUrl, `${prefix}图片链接`),
        series: series(source.series, `${prefix}系列`),
        enabled: enabled(source.enabled, `${prefix}显示状态`)
    };
}

function community(value: unknown, index: number): ProducerMapCommunity {
    const source = record(value);
    const prefix = `第${index + 1}个社群`;
    return {
        id: identifier(source.id, `${prefix} ID`),
        name: text(source.name, `${prefix}名称`, 100),
        platform: text(source.platform, `${prefix}平台`, 40),
        region: province(source.region, `${prefix}所属地区`, true),
        description: text(source.description, `${prefix}简介`, 600, true),
        contact: text(source.contact, `${prefix}联络信息`, 240, true),
        linkUrl: optionalUrl(source.linkUrl, `${prefix}链接`),
        imageUrl: optionalUrl(source.imageUrl, `${prefix}图片链接`),
        series: series(source.series, `${prefix}系列`),
        enabled: enabled(source.enabled, `${prefix}显示状态`)
    };
}

function unique(values: string[], label: string): void {
    if (new Set(values).size !== values.length) invalid(`${label}不能重复`);
}

export function validateProducerMapDraft(value: unknown): ProducerMapDraft {
    const source = record(value);
    if (source.version !== 1) invalid('制作人地图配置版本无效');
    if (!Array.isArray(source.regions) || source.regions.length > MAX_REGIONS) {
        invalid(`地区数量必须为0-${MAX_REGIONS}项`);
    }
    if (!Array.isArray(source.communities) || source.communities.length > MAX_COMMUNITIES) {
        invalid(`社群数量必须为0-${MAX_COMMUNITIES}项`);
    }
    const regions = source.regions.map(region);
    const communities = source.communities.map(community);
    unique(regions.map((item) => item.id), '地区 ID');
    unique(regions.map((item) => item.province), '行政区');
    unique(communities.map((item) => item.id), '社群 ID');
    return {
        version: 1,
        title: text(source.title, '页面标题', 80),
        subtitle: text(source.subtitle, '英文副标题', 120, true),
        introduction: text(source.introduction, '页面简介', 300),
        directoryTitle: text(source.directoryTitle, '社群名录标题', 80),
        mapSourceLabel: text(source.mapSourceLabel, '地图来源名称', 100),
        mapSourceUrl: externalUrl(source.mapSourceUrl, '地图来源链接'),
        regions,
        communities
    };
}

export function validateProducerMapUpdateRequest(value: unknown): ProducerMapUpdateRequest {
    const request = revisionedContentRequest(value, '制作人地图配置');
    return {
        content: validateProducerMapDraft(request.content),
        revision: request.revision
    };
}

export function parseProducerMapContent(body: Uint8Array): ProducerMapContent {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(body));
    } catch {
        throw new Error('Stored producer map content is invalid JSON');
    }
    const source = record(value);
    const content = validateProducerMapDraft(source);
    const updatedAt = source.updatedAt;
    if (updatedAt !== null && typeof updatedAt !== 'string') {
        throw new Error('Stored producer map update timestamp is invalid');
    }
    if (typeof updatedAt === 'string' && Number.isNaN(Date.parse(updatedAt))) {
        throw new Error('Stored producer map update timestamp is invalid');
    }
    return { ...content, updatedAt: updatedAt ?? null };
}

export function serializeProducerMapContent(content: ProducerMapContent): Uint8Array {
    return new TextEncoder().encode(`${JSON.stringify(content, null, 2)}\n`);
}
