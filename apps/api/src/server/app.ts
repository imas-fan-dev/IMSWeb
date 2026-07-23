import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { jsonBodyLimit } from '@/middleware/json-body-limit';
import {
    isDynamicBusinessRequest,
    requestRateLimit,
    validatedRequestPath
} from '@/middleware/rate-limit';
import type { RuntimeServices, ResolveServices } from '@/ports/runtime-services';
import type { JwtClaims } from '@/ports/security';
import { isSensitiveRequestPath } from '@/shared/static-path-policy';
import { registerAuditRoutes } from '@/domains/audit/hono-routes';
import { registerAuthRoutes } from '@/domains/auth/hono-routes';
import { registerChronicleRoutes } from '@/domains/chronicle/hono-routes';
import { registerEventRoutes } from '@/domains/events/hono-routes';
import { registerInformationRoutes } from '@/domains/information/hono-routes';
import { registerMediaRoutes } from '@/domains/media/hono-routes';
import { registerNamecardRoutes } from '@/domains/namecards/hono-routes';
import { registerNewsRoutes } from '@/domains/news/hono-routes';
import { registerReactionRoutes } from '@/domains/reactions/hono-routes';
import { registerSiteRoutes } from '@/domains/site/hono-routes';
import { registerWikiRoutes } from '@/domains/wiki/index';

export interface AppEnvironment {
    Bindings: object;
    Variables: {
        services: RuntimeServices;
        user?: JwtClaims;
        authSource?: 'authorization' | 'cookie';
    };
}

export type ImsHonoApp = Hono<AppEnvironment>;

export function createHonoApp<Bindings extends object = Record<string, unknown>>(
    resolveServices: ResolveServices<Bindings>
): ImsHonoApp {
    const app = new Hono<AppEnvironment>();

    app.use('*', async (c, next) => {
        // Resolving inside the request is required for Worker bindings. Node may
        // return shared process services, but Worker bindings must never leak.
        const runtime = await resolveServices(c.env as Bindings);
        c.set('services', runtime);
        await next();
    });

    app.use('*', async (c, next) => {
        const rawPath = new URL(c.req.raw.url).pathname;
        if (isSensitiveRequestPath(rawPath)) {
            return c.text('Forbidden', 403);
        }
        await next();
    });

    app.use('*', cors());
    app.use('*', secureHeaders({
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: 'cross-origin',
        strictTransportSecurity: 'max-age=31536000; includeSubDomains'
    }));

    app.use('*', requestRateLimit());
    app.use('*', jsonBodyLimit());
    app.use('*', async (c, next) => {
        const pathname = validatedRequestPath(c);
        const runtime = c.get('services');
        if (
            isDynamicBusinessRequest(c.req.method, pathname) &&
            runtime.compensation && runtime.storage
        ) {
            await runtime.compensation.run(runtime.storage, 3).catch((error) => console.warn(error));
        }
        await next();
    });

    // This route intentionally has no service dependency. It is the shared
    // Request/Response contract probe for both Node and Workers.
    app.get('/api/wiki/test', (c) => c.json({ status: 'ok' }));

    registerReactionRoutes(app);
    registerAuthRoutes(app);
    registerNamecardRoutes(app);
    registerEventRoutes(app);
    registerNewsRoutes(app);
    registerInformationRoutes(app);
    registerMediaRoutes(app);
    registerAuditRoutes(app);
    registerChronicleRoutes(app);
    registerSiteRoutes(app);
    registerWikiRoutes(app, (c) => c.get('services'));

    app.notFound(async (c) => {
        const assets = c.get('services').staticAssets;
        return assets ? assets.fetch(c.req.raw) : c.text('Not Found', 404);
    });

    app.onError((error, c) => {
        const candidate = Number((error as Error & { status?: unknown }).status);
        const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
            ? candidate
            : 500;
        if (status >= 500) console.error(error);
        return new Response(JSON.stringify({
            error: status >= 500 ? 'Internal server error' : error.message
        }), {
            status,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    });

    return app;
}
