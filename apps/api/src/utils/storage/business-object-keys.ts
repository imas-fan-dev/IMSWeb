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

export const INFORMATION_INDEX_OBJECT_KEY = 'editorial/information/index.json';
export const ABOUT_PAGE_OBJECT_KEY = 'editorial/about/config.json';

export function informationAssetObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `editorial/information/assets/${file.stem}/cover.${file.extension}`;
}

export function namecardImageObjectKey(filename: string): string {
    const file = fileParts(filename);
    return `community/namecards/assets/${file.stem}/image.${file.extension}`;
}

export function publicMediaObjectKey(value: string): string {
    const legacyKey = normalizeObjectKey(value);
    if (legacyKey.toLowerCase() === 'uploads/information/index.json') {
        return INFORMATION_INDEX_OBJECT_KEY;
    }
    const segments = legacyKey.split('/');
    const filename = segments.at(-1)!;
    const prefix = segments.slice(0, -1).join('/').toLowerCase();
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
        case 'uploads/namecard/original':
            return namecardImageObjectKey(filename);
        default:
            throw new Error(`Unsupported public media object path: ${legacyKey}`);
    }
}
