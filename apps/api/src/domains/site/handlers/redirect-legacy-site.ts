import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    legacySiteRedirectRequest,
    LEGACY_SITE_REDIRECTS
} from '@/domains/site/request';
import type { LegacyChronicleRedirectQuery } from '@/domains/site/request';
import type {
    SiteNotFoundResponse,
    SiteRedirectResponse
} from '@/domains/site/response';
import { renderSiteResponse } from '@/domains/site/response';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export function handleLegacySiteRedirect(c: Context<AppEnvironment>): Response {
    const request = legacySiteRedirectRequest(c.req.raw);
    const destination = LEGACY_SITE_REDIRECTS.get(request.pathname);
    if (!destination) {
        return renderSiteResponse(c, {
            kind: 'not-found',
            body: 'Not Found',
            status: 404
        } satisfies SiteNotFoundResponse);
    }
    return renderSiteResponse(c, {
        kind: 'redirect',
        location: destination,
        status: 301
    } satisfies SiteRedirectResponse);
}

export function handleLegacyChronicleRedirect(
    c: ValidatedRequestContext<AppEnvironment, 'query', LegacyChronicleRedirectQuery>
): Response {
    const { activityId } = c.req.valid('query');
    const destination = activityId
        ? `/chronicle/${encodeURIComponent(activityId)}`
        : '/chronicle';
    return renderSiteResponse(c, {
        kind: 'redirect',
        location: destination,
        status: 301
    } satisfies SiteRedirectResponse);
}
