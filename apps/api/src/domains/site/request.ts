export const LEGACY_SITE_REDIRECTS: ReadonlyMap<string, string> = new Map([
    ['/About.html', '/about'],
    ['/Event.html', '/events'],
    ['/addevent.html', '/events'],
    ['/producer.html', '/admin/login'],
    ['/producermap.html', '/producer-map'],
    ['/ProducerNameCard.html', '/community/cards'],
    ['/game.html', '/works/games'],
    ['/live.html', '/live'],
    ['/timeline.html', '/chronicle'],
    ['/eventchronicleadmin.html', '/admin/chronicle'],
    ['/informationedit.html', '/admin'],
    ['/other.html', '/works'],
    ['/hiro2026.html', '/sites/hiro2026'],
    ['/765Introduction.html', '/works/765'],
    ['/346Introduction.html', '/works/cg'],
    ['/MLIntroduction.html', '/works/ml'],
    ['/315Introduction.html', '/works/sidem'],
    ['/283Introduction.html', '/works/sc'],
    ['/GakuenIntroduction.html', '/works/gakuen'],
    ['/WOWSIntroduction.html', '/works/wows']
]);

export interface LegacySiteRedirectRequest {
    pathname: string;
}

export interface LegacyChronicleRedirectQuery {
    activityId: string | null;
}

export interface SiteIndexRequest {
    assetRequest: Request;
}

export function legacySiteRedirectRequest(request: Request): LegacySiteRedirectRequest {
    return { pathname: new URL(request.url).pathname };
}

export function validateLegacyChronicleRedirectQuery(
    value: unknown
): LegacyChronicleRedirectQuery {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { activityId: null };
    }
    const id = (value as { id?: unknown }).id;
    if (typeof id !== 'string') return { activityId: null };

    const activityId = id.trim();
    if (!activityId || /[/\\\u0000-\u001f\u007f]/.test(activityId)) {
        return { activityId: null };
    }
    return { activityId };
}

export function siteIndexRequest(request: Request): SiteIndexRequest {
    const url = new URL(request.url);
    url.pathname = '/index.html';
    url.search = '';
    return { assetRequest: new Request(url, request) };
}
