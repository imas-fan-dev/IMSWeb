import type { Context, Next } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { handleGetFudabaPublicOffice } from '@/domains/fudaba/handlers/get-public-office';
import { handleCreateFudabaCard } from '@/domains/fudaba/handlers/create-card';
import { handleDeleteFudabaCard } from '@/domains/fudaba/handlers/delete-card';
import { handleGetFudabaOwnerCard } from '@/domains/fudaba/handlers/get-owner-card';
import { handleListFudabaPublicCards } from '@/domains/fudaba/handlers/list-public-cards';
import { handleListFudabaPublicOffices } from '@/domains/fudaba/handlers/list-public-offices';
import { handleListFudabaPublicSeries } from '@/domains/fudaba/handlers/list-public-series';
import { handleListFudabaOwnerCards } from '@/domains/fudaba/handlers/list-owner-cards';
import { handleGetFudabaMapConfig } from '@/domains/fudaba/handlers/get-map-config';
import { handleGetFudabaOwnerLocation } from '@/domains/fudaba/handlers/get-owner-location';
import { handleListFudabaLocationReviews } from '@/domains/fudaba/handlers/list-location-reviews';
import { handleListFudabaMapOffices } from '@/domains/fudaba/handlers/list-map-offices';
import { handleReviewFudabaLocation } from '@/domains/fudaba/handlers/review-location';
import { handleSaveFudabaOwnerLocation } from '@/domains/fudaba/handlers/save-owner-location';
import { handleServeFudabaOwnerCardMedia } from '@/domains/fudaba/handlers/serve-owner-card-media';
import { handleUpdateFudabaCard } from '@/domains/fudaba/handlers/update-card';
import { handleUploadFudabaOwnedMedia } from '@/domains/fudaba/handlers/upload-owned-media';
import { handleWithdrawFudabaOwnerLocation } from '@/domains/fudaba/handlers/withdraw-owner-location';
import {
    activePlatformMutation,
    backofficeAuth,
    backofficeCsrf,
    currentBackofficeOp,
    optionalPlatformAuth,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { services } from '@/middleware/hono-context';
import {
    platformLocationRateLimit,
    platformUploadRateLimit,
    platformWriteRateLimit
} from '@/middleware/platform-mutation-limit';

async function privateFudabaResponse(
    c: Context<AppEnvironment>,
    next: Next
): Promise<void> {
    await next();
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Authorization, Cookie', { append: true });
}

async function requireFudabaPublicRead(
    c: Context<AppEnvironment>,
    next: Next
): Promise<Response | void> {
    if (services(c).config?.fudabaPublicReadEnabled !== true) {
        return c.text('Not Found', 404);
    }
    await next();
}

async function requireFudabaWrite(
    c: Context<AppEnvironment>,
    next: Next
): Promise<Response | void> {
    if (services(c).config?.fudabaWriteEnabled !== true) {
        return c.text('Not Found', 404);
    }
    await next();
}

async function requireFudabaMap(
    c: Context<AppEnvironment>,
    next: Next
): Promise<Response | void> {
    if (services(c).config?.fudabaMapEnabled !== true) {
        return c.text('Not Found', 404);
    }
    await next();
}

export function registerFudabaRoutes(app: ImsHonoApp): void {
    app.use('/api/community/exchange/*', privateFudabaResponse);
    app.use('/api/admin/community/exchange/*', privateFudabaResponse);
    app.get(
        '/api/community/exchange/series',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        handleListFudabaPublicSeries
    );
    app.get(
        '/api/community/exchange/offices',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        handleListFudabaPublicOffices
    );
    app.get(
        '/api/community/exchange/offices/:officeSlug',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        handleGetFudabaPublicOffice
    );
    app.get(
        '/api/community/exchange/cards',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        handleListFudabaPublicCards
    );
    app.get(
        '/api/community/exchange/map/config',
        requireFudabaPublicRead,
        requireFudabaMap,
        optionalPlatformAuth,
        handleGetFudabaMapConfig
    );
    app.get(
        '/api/community/exchange/map/offices',
        requireFudabaPublicRead,
        requireFudabaMap,
        optionalPlatformAuth,
        handleListFudabaMapOffices
    );
    app.get(
        '/api/community/exchange/me/series',
        platformAuth,
        handleListFudabaPublicSeries
    );
    app.get(
        '/api/community/exchange/me/cards',
        platformAuth,
        handleListFudabaOwnerCards
    );
    app.get(
        '/api/community/exchange/me/cards/:cardId',
        platformAuth,
        handleGetFudabaOwnerCard
    );
    app.get(
        '/api/community/exchange/me/offices/:officeId/location',
        platformAuth,
        handleGetFudabaOwnerLocation
    );
    app.get(
        '/api/community/exchange/me/cards/:cardId/media/:side',
        platformAuth,
        handleServeFudabaOwnerCardMedia
    );
    app.on(
        'HEAD',
        '/api/community/exchange/me/cards/:cardId/media/:side',
        platformAuth,
        handleServeFudabaOwnerCardMedia
    );
    const write = [
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformWriteRateLimit
    ] as const;
    const locationWrite = [
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformLocationRateLimit,
        platformWriteRateLimit
    ] as const;
    app.post(
        '/api/community/exchange/cards',
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformUploadRateLimit,
        platformWriteRateLimit,
        handleCreateFudabaCard
    );
    app.put(
        '/api/community/exchange/me/cards/:cardId',
        ...write,
        handleUpdateFudabaCard
    );
    app.delete(
        '/api/community/exchange/me/cards/:cardId',
        ...write,
        handleDeleteFudabaCard
    );
    app.put(
        '/api/community/exchange/me/offices/:officeId/location',
        ...locationWrite,
        handleSaveFudabaOwnerLocation
    );
    app.delete(
        '/api/community/exchange/me/offices/:officeId/location',
        ...locationWrite,
        handleWithdrawFudabaOwnerLocation
    );
    app.put(
        '/api/community/exchange/uploads/:side',
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformUploadRateLimit,
        handleUploadFudabaOwnedMedia
    );
    app.get(
        '/api/admin/community/exchange/office-locations',
        backofficeAuth,
        currentBackofficeOp,
        handleListFudabaLocationReviews
    );
    app.put(
        '/api/admin/community/exchange/office-locations/:officeId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        handleReviewFudabaLocation
    );
}
