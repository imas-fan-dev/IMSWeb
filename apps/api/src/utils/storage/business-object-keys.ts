function normalizeObjectKey(value: string): string {
    const key = value.replace(/^\/+/, '').replace(/\\/g, '/');
    const segments = key.split('/');
    if (
        !key || segments.some((segment) =>
            !segment || segment === '.' || segment === '..' || /[\u0000-\u001f\u007f]/.test(segment)
        )
    ) {
        throw new Error('Invalid business object key');
    }
    return key;
}

function fileParts(filename: string): { extension: string; stem: string } {
    const safe = normalizeObjectKey(filename);
    if (safe.includes('/')) throw new Error('Invalid business object filename');
    const separator = safe.lastIndexOf('.');
    if (separator <= 0 || separator === safe.length - 1) {
        return { stem: safe, extension: 'bin' };
    }
    return {
        stem: safe.slice(0, separator),
        extension: safe.slice(separator + 1).toLowerCase()
    };
}

function fudabaEntitySegment(value: string): string {
    if (
        !value || value === '.' || value === '..' ||
        /[\\/\u0000-\u001f\u007f]/.test(value)
    ) {
        throw new Error('Invalid Fudaba media entity ID');
    }
    return value;
}

function fudabaImageExtension(value: string): string {
    const extension = value.toLowerCase().replace(/^\./, '');
    if (!['avif', 'jpg', 'png', 'webp'].includes(extension)) {
        throw new Error('Invalid Fudaba media extension');
    }
    return extension;
}

export function newsOriginalObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `editorial/news/assets/${file.stem}/original.${file.extension}`;
}

export function newsThumbnailObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `editorial/news/assets/${file.stem.replace(/_thumb$/i, '')}/thumbnail.${file.extension}`;
}

export function eventPosterObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `editorial/events/assets/${file.stem}/poster.${file.extension}`;
}

export function articleAssetObjectKey(articleId: number, filename: string): string {
    if (!Number.isSafeInteger(articleId) || articleId <= 0) {
        throw new Error('Invalid article ID');
    }
    const file = fileParts(filename);
    return `editorial/articles/${articleId}/assets/${file.stem}.${file.extension}`;
}

export const INFORMATION_INDEX_OBJECT_KEY = 'editorial/information/index.json';
export const ABOUT_PAGE_OBJECT_KEY = 'editorial/about/config.json';
export const COMMUNITY_CONTENT_OBJECT_KEY = 'community/landing/config.json';

export const PRODUCER_MAP_OBJECT_KEY = 'community/producer-map/config.json';
export const FUDABA_MAP_DELIVERY_OBJECT_KEY = 'community/fudaba/map-delivery.json';

export function aboutHeroObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `editorial/about/assets/${file.stem}/hero.${file.extension}`;
}

export function aboutMemberAvatarObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `editorial/about/assets/${file.stem}/member-avatar.${file.extension}`;
}

export function informationAssetObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `editorial/information/assets/${file.stem}/cover.${file.extension}`;
}

export function communityContentAssetObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `community/landing/assets/${file.stem}/image.${file.extension}`;
}

export function producerMapAssetObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `community/producer-map/assets/${file.stem}/image.${file.extension}`;
}

// Legacy layout produced by the historical media migration
// (`scripts/migration/fudaba-media.js`). Runtime uploads no longer mint this
// shape, but the migration still needs it to address pre-existing objects.
export function fudabaAccountAvatarObjectKey(
    accountId: string,
    extension: string
): string {
    return `community/fudaba/accounts/${fudabaEntitySegment(accountId)}/` +
        `avatar.${fudabaImageExtension(extension)}`;
}

// Account avatars belong to the Platform identity, not to Fudaba, so new keys
// land under `platform/`. Avatars uploaded before that move keep their old
// `community/fudaba/accounts/` keys, which stay readable because every key is
// stored on its own profile row rather than rebuilt from this generator.
export function platformAccountAvatarVersionObjectKey(
    accountId: string,
    version: string
): string {
    return `platform/accounts/${fudabaEntitySegment(accountId)}/` +
        `avatars/${fudabaEntitySegment(version)}.webp`;
}

export function fudabaOfficeCoverObjectKey(
    officeId: string,
    extension: string
): string {
    return `community/fudaba/offices/${fudabaEntitySegment(officeId)}/` +
        `cover.${fudabaImageExtension(extension)}`;
}

export function fudabaOfficeCoverVersionObjectKey(
    officeId: string,
    version: string
): string {
    return `community/fudaba/offices/${fudabaEntitySegment(officeId)}/` +
        `covers/${fudabaEntitySegment(version)}.webp`;
}

export function fudabaCardFrontObjectKey(
    cardId: string,
    extension: string
): string {
    return `community/fudaba/cards/${fudabaEntitySegment(cardId)}/` +
        `front.${fudabaImageExtension(extension)}`;
}

export function fudabaCardBackObjectKey(
    cardId: string,
    extension: string
): string {
    return `community/fudaba/cards/${fudabaEntitySegment(cardId)}/` +
        `back.${fudabaImageExtension(extension)}`;
}

/**
 * Role-agnostic key for an owner-uploaded card image. The slot an image ends up
 * in (front, back, middle) is decided by the ordered media submission, so the
 * key must not encode the role: reordering a card would otherwise collide with
 * the object it is being swapped with.
 */
export function fudabaCardMediaVersionObjectKey(
    cardId: string,
    version: string
): string {
    return `community/fudaba/cards/${fudabaEntitySegment(cardId)}/` +
        `versions/${fudabaEntitySegment(version)}/media.webp`;
}

/**
 * Editor artwork keeps its 600px copy beside the original, so a list can ask
 * for the small file with the same key it already holds.
 */
/** 拆解统一布局 key；不是这种布局时返回 null（迁移前的旧 key）。 */
export function parseCardPageObjectKey(key: string): {
    cardId: string;
    queue: 'live' | 'pending';
    pageId: string;
    version: string;
} | null {
    const match =
        /^community\/fudaba\/cards\/([^/]+)\/(live|pending)\/(front|back|page-[0-9a-f-]{8,})\.([0-9a-f-]{8,})\.webp$/.exec(
            key
        );
    if (!match) return null;
    return {
        cardId: match[1]!,
        queue: match[2] as 'live' | 'pending',
        pageId: match[3]!,
        version: match[4]!
    };
}

/** 版本化页面 key：只有这种地址可以按「不可变」长期缓存。 */
export function isCardPageObjectKey(key: string): boolean {
    return /^community\/fudaba\/cards\/[^/]+\/(?:live|pending)\/(?:front|back|page-[0-9a-f-]{8,})\.[0-9a-f-]{8,}\.webp$/.test(
        key
    );
}

const CARD_PAGE_ID = /^(?:front|back|page-[0-9a-f-]{8,})$/;
const CARD_PAGE_QUEUE = /^(?:live|pending)$/;

/**
 * 对外可见的尺寸档位（按渲染宽度 × 设备像素比取整）：
 * - 160  缩略图条（80 @2x）
 * - 400  列表瓦片 1x
 * - 800  列表瓦片 2x / 详情画廊 1x
 * - 1400 详情画廊 2x
 * 其余宽度一律拒绝，避免缓存被任意参数打散。
 */
export const CARD_PAGE_WIDTHS = [160, 400, 800, 1400] as const;

/**
 * 统一的名片页面 key：`cards/<cardId>/<queue>/<pageId>.<version>.webp`。
 * 槽位（pageId）与顺序无关，版本每次写入都变，地址不可变。
 */
export function cardPageObjectKey(
    cardId: string,
    queue: string,
    pageId: string,
    version: string
): string {
    if (!CARD_PAGE_QUEUE.test(queue)) {
        throw new Error(`Unsupported card page queue: ${queue}`);
    }
    if (!CARD_PAGE_ID.test(pageId)) {
        throw new Error(`Unsupported card page id: ${pageId}`);
    }
    return (
        `community/fudaba/cards/${fudabaEntitySegment(cardId)}/${queue}/` +
        `${pageId}.${fudabaEntitySegment(version)}.webp`
    );
}

/** 按需生成的小图，与源对象同作用域；版本一换即失效。 */
export function cardPageCacheObjectKey(
    cardId: string,
    queue: string,
    pageId: string,
    version: string,
    width: number
): string {
    if (!(CARD_PAGE_WIDTHS as readonly number[]).includes(width)) {
        throw new Error(`Unsupported card page width: ${width}`);
    }
    return (
        `community/fudaba/cards/${fudabaEntitySegment(cardId)}/${queue}/cache/` +
        `${pageId}.${fudabaEntitySegment(version)}.${width}.webp`
    );
}

export function fudabaCardMiddleVersionObjectKey(
    cardId: string,
    index: number,
    version: string
): string {
    return `community/fudaba/cards/${fudabaEntitySegment(cardId)}/` +
        `versions/${fudabaEntitySegment(version)}/middle-${index}.webp`;
}

export function fudabaCardSideVersionObjectKey(
    cardId: string,
    side: 'front' | 'back',
    version: string
): string {
    return `community/fudaba/cards/${fudabaEntitySegment(cardId)}/` +
        `versions/${fudabaEntitySegment(version)}/${side}.webp`;
}

export function publicMediaObjectKey(value: string): string {
    const legacyKey = normalizeObjectKey(value);
    if (legacyKey.toLowerCase() === 'uploads/information/index.json') {
        return INFORMATION_INDEX_OBJECT_KEY;
    }
    const segments = legacyKey.split('/');
    const filename = segments.at(-1)!;
    const prefix = segments.slice(0, -1).join('/').toLowerCase();
    if (
        segments.length === 4 && segments[0]?.toLowerCase() === 'uploads' &&
        segments[1]?.toLowerCase() === 'articles'
    ) {
        const articleId = Number(segments[2]);
        if (!Number.isSafeInteger(articleId) || articleId <= 0) {
            throw new Error(`Unsupported article asset path: ${legacyKey}`);
        }
        return articleAssetObjectKey(articleId, filename);
    }
    switch (prefix) {
        case 'uploads/news/original':
            return newsOriginalObjectKey(filename);
        case 'uploads/news/thumb':
            return newsThumbnailObjectKey(filename);
        case 'uploads/event/original':
        case 'uploads/event/thumb':
        case 'uploads/events':
            return eventPosterObjectKey(filename);
        case 'uploads/information':
            return informationAssetObjectKey(filename);
        case 'uploads/information/original':
            return informationAssetObjectKey(filename);
        case 'uploads/about/hero':
            return aboutHeroObjectKey(filename);
        case 'uploads/about/member-avatars':
            return aboutMemberAvatarObjectKey(filename);
        case 'uploads/community-content':
            return communityContentAssetObjectKey(filename);
        case 'uploads/producer-map':
            return producerMapAssetObjectKey(filename);
        default:
            throw new Error(`Unsupported public media object path: ${legacyKey}`);
    }
}
