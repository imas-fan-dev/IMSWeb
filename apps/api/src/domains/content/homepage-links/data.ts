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
