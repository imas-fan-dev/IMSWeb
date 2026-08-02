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
import { handleServeFudabaOwnerCardMedia } from '@/domains/fudaba/handlers/serve-owner-card-media';
import { handleUpdateFudabaCard } from '@/domains/fudaba/handlers/update-card';
import { handleUploadFudabaOwnedMedia } from '@/domains/fudaba/handlers/upload-owned-media';
import {
    activePlatformMutation,
    optionalPlatformAuth,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { services } from '@/middleware/hono-context';
import {
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

export function registerFudabaRoutes(app: ImsHonoApp): void {
    app.use('/api/community/exchange/*', privateFudabaResponse);
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
        '/api/community/exchange/uploads/:side',
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformUploadRateLimit,
        handleUploadFudabaOwnedMedia
    );
}
