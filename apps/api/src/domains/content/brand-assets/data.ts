export interface BrandAssetDefinition {
    publicPath: string;
    sourcePath: string;
    objectKey: string;
    kind: 'image' | 'font';
    contentType: 'image/png' | 'font/ttf';
}

export const BRAND_ASSET_DEFINITIONS: readonly BrandAssetDefinition[] = [
    {
        publicPath: '/assets/images/Production/765Haruka.png',
        sourcePath: '/assets/images/Production/765Haruka.png',
        objectKey: 'brand/works/765/character.png',
        kind: 'image',
        contentType: 'image/png'
    },
    {
        publicPath: '/assets/images/Production/346Uzuki.png',
        sourcePath: '/assets/images/Production/346Uzuki.png',
        objectKey: 'brand/works/cg/character.png',
        kind: 'image',
        contentType: 'image/png'
    },
    {
        publicPath: '/assets/images/Production/765Mirai.png',
        sourcePath: '/assets/images/Production/765Mirai.png',
        objectKey: 'brand/works/ml/character.png',
        kind: 'image',
        contentType: 'image/png'
    },
    {
        publicPath: '/assets/images/Production/315Teru.png',
        sourcePath: '/assets/images/Production/315Teru.png',
        objectKey: 'brand/works/sidem/character.png',
        kind: 'image',
        contentType: 'image/png'
    },
    {
        publicPath: '/assets/images/Production/283Mano.png',
        sourcePath: '/assets/images/Production/283Mano.png',
        objectKey: 'brand/works/sc/character.png',
        kind: 'image',
        contentType: 'image/png'
    },
    {
        publicPath: '/assets/images/Production/GakuenSaki.png',
        sourcePath: '/assets/images/Production/GakuenSaki.png',
        objectKey: 'brand/works/gakuen/character.png',
        kind: 'image',
        contentType: 'image/png'
    },
    {
        publicPath: '/assets/font/IrisIdol.ttf',
        sourcePath: '/assets/font/IrisIdol.ttf',
        objectKey: 'brand/fonts/iris-idol.ttf',
        kind: 'font',
        contentType: 'font/ttf'
    }
] as const;

const objectKeysByPublicPath = new Map(
    BRAND_ASSET_DEFINITIONS.map((asset) => [asset.publicPath, asset.objectKey])
);
const definitionsByPublicPath = new Map(
    BRAND_ASSET_DEFINITIONS.map((asset) => [asset.publicPath, asset])
);

export function brandAssetDefinition(publicPath: string): BrandAssetDefinition | null {
    return definitionsByPublicPath.get(publicPath) ?? null;
}

export function brandAssetObjectKey(publicPath: string): string | null {
    return objectKeysByPublicPath.get(publicPath) ?? null;
}
