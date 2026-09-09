export interface CanonicalFudabaAgency {
    id: number;
    code: string;
    name: string;
    color: string;
    order: number;
    iconObjectKey: string;
}

export const CANONICAL_FUDABA_AGENCIES: readonly Readonly<CanonicalFudabaAgency>[] =
    Object.freeze([
        { id: 1, code: '765', name: '765PRO', color: '#f34f6d', order: 0,
            iconObjectKey: 'wiki/shared/static/icon/765pro.webp' },
        { id: 2, code: '876', name: '876PRO', color: '#656a75', order: 1,
            iconObjectKey: 'wiki/shared/static/icon/876pro.webp' },
        { id: 3, code: 'cg', name: '灰姑娘女孩', color: '#2681c8', order: 2,
            iconObjectKey: 'wiki/shared/static/icon/cg.webp' },
        { id: 4, code: 'ml', name: '百万现场', color: '#ffc30b', order: 3,
            iconObjectKey: 'wiki/shared/static/icon/ml.webp' },
        { id: 5, code: 'sidem', name: 'SideM', color: '#0fbe94', order: 4,
            iconObjectKey: 'wiki/shared/static/icon/sidem.webp' },
        { id: 6, code: 'sc', name: '闪耀色彩', color: '#8dbbff', order: 5,
            iconObjectKey: 'wiki/shared/static/icon/sc.webp' },
        { id: 7, code: 'gk', name: '学园偶像大师', color: '#f39800', order: 6,
            iconObjectKey: 'wiki/shared/static/icon/gk.webp' }
    ].map((agency) => Object.freeze(agency)));

export function projectCanonicalFudabaAgencies(): CanonicalFudabaAgency[] {
    return CANONICAL_FUDABA_AGENCIES.map((agency) => ({ ...agency }));
}
