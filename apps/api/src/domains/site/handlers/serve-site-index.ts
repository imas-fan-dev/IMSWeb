import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { siteIndexRequest } from '@/domains/site/request';
import type {
    SiteIndexAssetResponse,
    SiteNotFoundResponse
} from '@/domains/site/response';
import { renderSiteResponse } from '@/domains/site/response';
import { services } from '@/middleware/hono-context';

export async function handleServeSiteIndex(c: Context<AppEnvironment>): Promise<Response> {
    const assets = services(c).staticAssets;
    if (!assets) {
        return renderSiteResponse(c, {
            kind: 'not-found',
            body: 'Not Found',
            status: 404
        } satisfies SiteNotFoundResponse);
    }
    const request = siteIndexRequest(c.req.raw);
    return renderSiteResponse(c, {
        kind: 'index-asset',
        response: await assets.fetch(request.assetRequest)
    } satisfies SiteIndexAssetResponse);
}
