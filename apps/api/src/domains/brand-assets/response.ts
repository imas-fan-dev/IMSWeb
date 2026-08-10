import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { BrandAssetDefinition } from '@/domains/brand-assets/data';
import type { ObjectStorage } from '@/ports/object-storage';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { storedObjectResponse } from '@/utils/http/stored-object-response';

const BRAND_ASSET_CACHE_CONTROL = 'public, max-age=300' as const;

export interface BrandAssetStoredObjectResponseBoundary {
    category: 'stored-object';
    statuses: readonly [200, 206, 416];
    getBody: readonly ['binary', 'empty'];
    headBody: 'empty';
    contentType: 'stored-object-metadata';
    cacheControl: typeof BRAND_ASSET_CACHE_CONTROL;
    securityHeaders: readonly [];
}

export interface BrandAssetRedirectResponseBoundary {
    category: 'redirect';
    statuses: readonly [307];
    getBody: readonly ['empty'];
    headBody: 'empty';
    contentType: null;
    cacheControl: typeof BRAND_ASSET_CACHE_CONTROL;
    securityHeaders: readonly ['Referrer-Policy: no-referrer'];
}

export interface BrandAssetNotFoundResponseBoundary {
    category: 'not-found';
    statuses: readonly [404];
    getBody: readonly ['text'];
    headBody: 'empty';
    contentType: 'text/plain; charset=UTF-8';
    cacheControl: null;
    securityHeaders: readonly [];
}

export type BrandAssetResponseBoundary =
    | BrandAssetStoredObjectResponseBoundary
    | BrandAssetRedirectResponseBoundary
    | BrandAssetNotFoundResponseBoundary;

export const BRAND_ASSET_RESPONSE_BOUNDARIES = {
    storedObject: {
        category: 'stored-object',
        statuses: [200, 206, 416],
        getBody: ['binary', 'empty'],
        headBody: 'empty',
        contentType: 'stored-object-metadata',
        cacheControl: BRAND_ASSET_CACHE_CONTROL,
        securityHeaders: []
    },
    redirect: {
        category: 'redirect',
        statuses: [307],
        getBody: ['empty'],
        headBody: 'empty',
        contentType: null,
        cacheControl: BRAND_ASSET_CACHE_CONTROL,
        securityHeaders: ['Referrer-Policy: no-referrer']
    },
    notFound: {
        category: 'not-found',
        statuses: [404],
        getBody: ['text'],
        headBody: 'empty',
        contentType: 'text/plain; charset=UTF-8',
        cacheControl: null,
        securityHeaders: []
    }
} as const satisfies {
    storedObject: BrandAssetStoredObjectResponseBoundary;
    redirect: BrandAssetRedirectResponseBoundary;
    notFound: BrandAssetNotFoundResponseBoundary;
};

function cacheHeaders(): HeadersInit {
    return {
        'Cache-Control': BRAND_ASSET_RESPONSE_BOUNDARIES.storedObject.cacheControl
    };
}

export async function brandAssetObjectResponse(
    request: Request,
    storage: ObjectStorage,
    asset: BrandAssetDefinition
): Promise<Response | null> {
    if (asset.kind === 'font') {
        const object = await storage.get(asset.objectKey);
        return object
            ? storedObjectResponse(request, object, cacheHeaders())
            : null;
    }
    return objectReadResponse(request, storage, asset.objectKey, cacheHeaders());
}

export function brandAssetNotFoundResponse(
    c: Context<AppEnvironment>
): Response {
    const boundary = BRAND_ASSET_RESPONSE_BOUNDARIES.notFound;
    return c.text('Not Found', boundary.statuses[0]);
}
