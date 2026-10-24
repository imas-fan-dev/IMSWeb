import type { ImsHonoApp } from '@/app';
import { BRAND_ASSET_DEFINITIONS } from '@/domains/content/brand-assets/data';
import { handleServeBrandAsset } from '@/domains/content/brand-assets/handlers/serve-brand-asset';

export function registerBrandAssetRoutes(app: ImsHonoApp): void {
    for (const asset of BRAND_ASSET_DEFINITIONS) {
        app.get(asset.publicPath, handleServeBrandAsset);
        app.on('HEAD', asset.publicPath, handleServeBrandAsset);
    }
}
