import type { Context } from 'hono';

export interface SiteRedirectResponse {
    kind: 'redirect';
    location: string;
    status: 301;
}

export interface SiteNotFoundResponse {
    kind: 'not-found';
    body: 'Not Found';
    status: 404;
}

export interface SiteIndexAssetResponse {
    kind: 'index-asset';
    response: Response;
}

export type SiteResponse =
    | SiteRedirectResponse
    | SiteNotFoundResponse
    | SiteIndexAssetResponse;

export function renderSiteResponse(c: Context, model: SiteResponse): Response {
    if (model.kind === 'redirect') return c.redirect(model.location, model.status);
    if (model.kind === 'not-found') return c.text(model.body, model.status);
    return model.response;
}
