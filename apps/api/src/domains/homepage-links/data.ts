import {
    HOMEPAGE_LINK_SECTIONS,
    type HomepageLinkRecord,
    type HomepageLinkSection
} from '@/ports/repositories';

export const HOMEPAGE_LINK_ICONS = [
    'calendar',
    'book-open',
    'radio-tower',
    'contact',
    'library',
    'id-card',
    'map',
    'gamepad',
    'history',
    'info',
    'external-link'
] as const;

export const HOMEPAGE_LINK_ACCENTS = [
    'franchise-765',
    'franchise-cg',
    'franchise-ml',
    'franchise-sidem',
    'franchise-sc',
    'franchise-gk',
    'primary',
    'info',
    'success',
    'warning'
] as const;

export type HomepageLinkIcon = typeof HOMEPAGE_LINK_ICONS[number];
export type HomepageLinkAccent = typeof HOMEPAGE_LINK_ACCENTS[number];

export interface HomepageLinkSubmission {
    section?: HomepageLinkSection;
    title: string;
    description: string;
    href: string;
    icon: HomepageLinkIcon;
    accent: HomepageLinkAccent;
}

export interface PublicHomepageLink {
    id: string;
    section: HomepageLinkSection;
    title: string;
    description: string;
    href: string;
    icon: HomepageLinkIcon;
    accent: HomepageLinkAccent;
    displayOrder: number;
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

export function parseHomepageLinkSection(value: unknown): HomepageLinkSection {
    if (!HOMEPAGE_LINK_SECTIONS.includes(value as HomepageLinkSection)) {
        throw Object.assign(new Error('首页板块无效'), { status: 400 });
    }
    return value as HomepageLinkSection;
}

export function validateHomepageLinkSubmission(
    value: unknown,
    options: { includeSection: boolean }
): HomepageLinkSubmission {
    if (!value || typeof value !== 'object') {
        throw Object.assign(new Error('首页链接格式无效'), { status: 400 });
    }
    const candidate = value as Record<string, unknown>;
    const title = cleanString(candidate.title);
    const description = cleanString(candidate.description);
    const href = cleanString(candidate.href);
    const icon = candidate.icon as HomepageLinkIcon;
    const accent = candidate.accent as HomepageLinkAccent;

    if (!title || title.length > 80) {
        throw Object.assign(new Error('标题必须为 1-80 个字符'), { status: 400 });
    }
    if (description.length > 200) {
        throw Object.assign(new Error('说明不能超过 200 个字符'), { status: 400 });
    }
    if (!validHref(href)) {
        throw Object.assign(new Error('链接必须是站内路径或 HTTP(S) 地址'), { status: 400 });
    }
    if (!HOMEPAGE_LINK_ICONS.includes(icon)) {
        throw Object.assign(new Error('链接图标无效'), { status: 400 });
    }
    if (!HOMEPAGE_LINK_ACCENTS.includes(accent)) {
        throw Object.assign(new Error('链接强调色无效'), { status: 400 });
    }

    return {
        ...(options.includeSection
            ? { section: parseHomepageLinkSection(candidate.section) }
            : {}),
        title,
        description,
        href,
        icon,
        accent
    };
}

export function publicHomepageLink(record: HomepageLinkRecord): PublicHomepageLink {
    return {
        id: record.id,
        section: record.section,
        title: record.title,
        description: record.description,
        href: record.href,
        icon: record.icon as HomepageLinkIcon,
        accent: record.accent as HomepageLinkAccent,
        displayOrder: record.display_order
    };
}
