import {
    HOMEPAGE_LINK_ACCENTS,
    HOMEPAGE_LINK_ICONS,
    type HomepageLinkAccent,
    type HomepageLinkIcon
} from '@/domains/content/homepage-links/data';
import {
    HOMEPAGE_LINK_SECTIONS,
    type HomepageLinkSection
} from '@/ports/repositories';
import {
    invalidRequest,
    requestRecord,
    uniqueStringIdListRequest
} from '@/utils/validation/request-data';

export interface HomepageLinkIdParams {
    id: string;
}

export interface HomepageLinkSectionParams {
    section: HomepageLinkSection;
}

export interface HomepageLinkFieldsRequest {
    title: string;
    description: string;
    href: string;
    icon: HomepageLinkIcon;
    accent: HomepageLinkAccent;
}

export interface NewHomepageLinkRequest extends HomepageLinkFieldsRequest {
    section: HomepageLinkSection;
}

export type HomepageLinkUpdateRequest = HomepageLinkFieldsRequest;

export interface HomepageLinkOrderRequest {
    ids: string[];
}

function cleanString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function validHref(value: string): boolean {
    if (!value || value.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(value)) return false;
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

function validateHomepageLinkFields(
    candidate: { readonly [field: string]: unknown }
): HomepageLinkFieldsRequest {
    const title = cleanString(candidate.title);
    const description = cleanString(candidate.description);
    const href = cleanString(candidate.href);
    const icon = candidate.icon as HomepageLinkIcon;
    const accent = candidate.accent as HomepageLinkAccent;

    if (!title || title.length > 80) {
        invalidRequest('标题必须为 1-80 个字符');
    }
    if (description.length > 200) {
        invalidRequest('说明不能超过 200 个字符');
    }
    if (!validHref(href)) {
        invalidRequest('链接必须是站内路径或 HTTP(S) 地址');
    }
    if (!HOMEPAGE_LINK_ICONS.includes(icon)) {
        invalidRequest('链接图标无效');
    }
    if (!HOMEPAGE_LINK_ACCENTS.includes(accent)) {
        invalidRequest('链接强调色无效');
    }

    return { title, description, href, icon, accent };
}

export function parseHomepageLinkSection(value: unknown): HomepageLinkSection {
    if (!HOMEPAGE_LINK_SECTIONS.includes(value as HomepageLinkSection)) {
        invalidRequest('首页板块无效');
    }
    return value as HomepageLinkSection;
}

export function validateHomepageLinkIdParams(value: unknown): HomepageLinkIdParams {
    const params = requestRecord(value, '首页链接 ID 无效');
    if (typeof params.id !== 'string' || !params.id) {
        invalidRequest('首页链接 ID 无效');
    }
    return { id: params.id };
}

export function validateHomepageLinkSectionParams(value: unknown): HomepageLinkSectionParams {
    const params = requestRecord(value, '首页板块无效');
    return { section: parseHomepageLinkSection(params.section) };
}

export function validateHomepageLinkSubmission(
    value: unknown,
    options: { includeSection: true }
): NewHomepageLinkRequest;
export function validateHomepageLinkSubmission(
    value: unknown,
    options: { includeSection: false }
): HomepageLinkUpdateRequest;
export function validateHomepageLinkSubmission(
    value: unknown,
    options: { includeSection: boolean }
): NewHomepageLinkRequest | HomepageLinkUpdateRequest {
    if (!value || typeof value !== 'object') {
        invalidRequest('首页链接格式无效');
    }
    const candidate = value as { readonly [field: string]: unknown };
    const fields = validateHomepageLinkFields(candidate);
    return options.includeSection
        ? { ...fields, section: parseHomepageLinkSection(candidate.section) }
        : fields;
}

export function validateNewHomepageLinkRequest(value: unknown): NewHomepageLinkRequest {
    return validateHomepageLinkSubmission(value, { includeSection: true });
}

export function validateHomepageLinkUpdateRequest(value: unknown): HomepageLinkUpdateRequest {
    return validateHomepageLinkSubmission(value, { includeSection: false });
}

export function validateHomepageLinkOrderRequest(value: unknown): HomepageLinkOrderRequest {
    return {
        ids: uniqueStringIdListRequest(value, {
            invalid: '排序内容必须是链接 ID 列表',
            duplicate: '排序内容包含重复链接'
        })
    };
}
