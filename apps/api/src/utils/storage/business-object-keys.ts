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
export const PRODUCER_MAP_OBJECT_KEY = 'community/producer-map/config.json';

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

export function namecardImageObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `community/namecards/assets/${file.stem}/image.${file.extension}`;
}

export function namecardThumbnailObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `community/namecards/assets/${file.stem}/thumbnail.jpg`;
}

export function namecardThumbnailPublicUrl(originalUrl: string): string {
    const legacyKey = normalizeObjectKey(originalUrl);
    const segments = legacyKey.split('/');
    const filename = segments.at(-1)!;
    const prefix = segments.slice(0, -1).join('/').toLowerCase();
    if (prefix !== 'uploads/namecard/original') {
        throw new Error(`Unsupported namecard media path: ${legacyKey}`);
    }
    return `/uploads/namecard/thumbnail/${filename}.jpg`;
}

export function namecardMediaObjectKeys(originalUrl: string): [string, string] {
    const thumbnailUrl = namecardThumbnailPublicUrl(originalUrl);
    return [publicMediaObjectKey(originalUrl), publicMediaObjectKey(thumbnailUrl)];
}

export function producerMapAssetObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `community/producer-map/assets/${file.stem}/image.${file.extension}`;
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
        case 'uploads/namecard/original':
            return namecardImageObjectKey(filename);
        case 'uploads/namecard/thumbnail': {
            const suffix = '.jpg';
            if (!filename.toLowerCase().endsWith(suffix) || filename.length === suffix.length) {
                throw new Error(`Unsupported namecard thumbnail path: ${legacyKey}`);
            }
            return namecardThumbnailObjectKey(filename.slice(0, -suffix.length));
        }
        case 'uploads/producer-map':
            return producerMapAssetObjectKey(filename);
        default:
            throw new Error(`Unsupported public media object path: ${legacyKey}`);
    }
}
