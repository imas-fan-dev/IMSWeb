const SLUG_CHARACTER_PATTERN = /[^a-z0-9\u4e00-\u9fa5]+/g;

export function fudabaOfficeSlug(name: string, id: string): string {
    const base = name.normalize('NFKC').toLowerCase()
        .replace(SLUG_CHARACTER_PATTERN, '-')
        .replace(/^-+|-+$/g, '') || 'office';
    const suffix = id.replace(/-/g, '').slice(0, 12).toLowerCase();
    return `${base.slice(0, 120 - suffix.length - 1).replace(/-+$/g, '')}-${suffix}`;
}
