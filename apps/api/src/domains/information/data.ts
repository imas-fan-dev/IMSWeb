export const INFORMATION_INDEX_KEY = 'uploads/information/index.json';

export const INFORMATION_CATEGORIES = ['activity', 'fan'] as const;
export const INFORMATION_CONTENT_TYPES = ['external', 'html'] as const;

export type InformationCategory = typeof INFORMATION_CATEGORIES[number];
export type InformationContentType = typeof INFORMATION_CONTENT_TYPES[number];

export interface InformationCard {
    id: string;
    category: InformationCategory;
    contentType: InformationContentType;
    image: string;
    link: string;
    title: string;
    html?: string;
    updatedAt: string;
}

export interface InformationCardSummary extends Omit<InformationCard, 'html'> {}

export interface InformationIndex {
    version: 1;
    cards: InformationCard[];
    assets: string[];
}

const CARD_ID = /^[a-z0-9][a-z0-9_-]{7,63}$/i;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;
const MAX_HTML_LENGTH = 500_000;

function cleanString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function informationAssetUrl(value: unknown): value is string {
    if (typeof value !== 'string' || !value.startsWith('/uploads/information/')) return false;
    if (!IMAGE_EXTENSION.test(value) || /[?#\\\u0000-\u001f\u007f]/.test(value)) return false;
    const segments = value.slice(1).split('/');
    return segments.length >= 3 && segments.every((segment) =>
        Boolean(segment) && segment !== '.' && segment !== '..'
    );
}

function legacyInformationImage(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('/assets/images/') &&
        IMAGE_EXTENSION.test(value) && !/[?#\\\u0000-\u001f\u007f]/.test(value) &&
        value.slice(1).split('/').every((segment) =>
            Boolean(segment) && segment !== '.' && segment !== '..'
        );
}

export function informationLink(value: unknown): value is string {
    if (typeof value !== 'string' || !value || value.length > 4096 ||
        /[\\\u0000-\u001f\u007f]/.test(value)) return false;
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

function informationCategory(value: unknown): InformationCategory {
    return INFORMATION_CATEGORIES.includes(value as InformationCategory)
        ? value as InformationCategory
        : 'fan';
}

function informationContentType(value: unknown, html: string): InformationContentType {
    if (value === 'html' || html) return 'html';
    return 'external';
}

function normalizeCard(
    item: unknown,
    index: number,
    assetSet: ReadonlySet<string>
): InformationCard {
    if (!item || typeof item !== 'object') throw new Error('Information card must be an object');
    const card = item as Record<string, unknown>;
    const title = cleanString(card.title);
    const image = cleanString(card.image ?? card.img);
    const html = typeof card.html === 'string' ? card.html.trim() : '';
    const contentType = informationContentType(card.contentType, html);
    const rawId = cleanString(card.id);
    const id = CARD_ID.test(rawId) ? rawId : `legacy-card-${String(index + 1).padStart(3, '0')}`;
    const link = contentType === 'html'
        ? `/information/${encodeURIComponent(id)}`
        : cleanString(card.link);
    const updatedAt = cleanString(card.updatedAt) || new Date(0).toISOString();

    if (!title || title.length > 200) {
        throw new Error('Information card title is invalid');
    }
    if (
        (!informationAssetUrl(image) && !legacyInformationImage(image)) ||
        (informationAssetUrl(image) && !assetSet.has(image))
    ) {
        throw new Error('Information card image is invalid');
    }
    if (contentType === 'external' && !informationLink(link)) {
        throw new Error('Information card external link is invalid');
    }
    if (
        contentType === 'html' &&
        (!html || html.length > MAX_HTML_LENGTH || /[\u0000\u007f]/.test(html))
    ) {
        throw new Error('Information card HTML is invalid');
    }
    if (Number.isNaN(Date.parse(updatedAt))) {
        throw new Error('Information card timestamp is invalid');
    }

    return {
        id,
        category: informationCategory(card.category),
        contentType,
        image,
        link,
        title,
        ...(contentType === 'html' ? { html } : {}),
        updatedAt
    };
}

export function parseInformationIndex(body: Uint8Array): InformationIndex {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
        throw new Error('Information index is not valid UTF-8 JSON');
    }
    if (!value || typeof value !== 'object') throw new Error('Information index must be an object');

    const candidate = value as Record<string, unknown>;
    if (candidate.version !== 1 || !Array.isArray(candidate.cards) || !Array.isArray(candidate.assets)) {
        throw new Error('Information index has an unsupported schema');
    }

    const assets = candidate.assets;
    if (!assets.every(informationAssetUrl) || new Set(assets).size !== assets.length) {
        throw new Error('Information index contains invalid or duplicate assets');
    }
    const assetSet = new Set(assets);
    const cards = candidate.cards.map((item, index) => normalizeCard(item, index, assetSet));
    if (new Set(cards.map((card) => card.id)).size !== cards.length) {
        throw new Error('Information index contains duplicate card ids');
    }

    return { version: 1, cards, assets };
}

export function serializeInformationIndex(index: InformationIndex): Uint8Array {
    return new TextEncoder().encode(`${JSON.stringify(index, null, 2)}\n`);
}

export function informationCardSummary(card: InformationCard): InformationCardSummary {
    const { html: _html, ...summary } = card;
    return summary;
}

export function defaultInformationIndex(): InformationIndex {
    return {
        version: 1,
        assets: [],
        cards: []
    };
}
