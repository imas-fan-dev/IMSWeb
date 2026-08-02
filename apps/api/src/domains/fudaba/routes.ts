import type { Context, Next } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { handleGetFudabaPublicOffice } from '@/domains/fudaba/handlers/get-public-office';
import { handleListFudabaPublicCards } from '@/domains/fudaba/handlers/list-public-cards';
import { handleListFudabaPublicOffices } from '@/domains/fudaba/handlers/list-public-offices';
import { handleListFudabaPublicSeries } from '@/domains/fudaba/handlers/list-public-series';
import { optionalPlatformAuth } from '@/middleware/hono-auth';
import { services } from '@/middleware/hono-context';

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

export function registerFudabaRoutes(app: ImsHonoApp): void {
    app.use('/api/community/exchange/*', privateFudabaResponse);
    app.use('/api/community/exchange/*', requireFudabaPublicRead);
    app.get(
        '/api/community/exchange/series',
        optionalPlatformAuth,
        handleListFudabaPublicSeries
    );
    app.get(
        '/api/community/exchange/offices',
        optionalPlatformAuth,
        handleListFudabaPublicOffices
    );
    app.get(
        '/api/community/exchange/offices/:officeSlug',
        optionalPlatformAuth,
        handleGetFudabaPublicOffice
    );
    app.get(
        '/api/community/exchange/cards',
        optionalPlatformAuth,
        handleListFudabaPublicCards
    );
}
