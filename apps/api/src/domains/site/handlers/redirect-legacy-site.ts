import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';

export const LEGACY_SITE_REDIRECTS: ReadonlyMap<string, string> = new Map([
    ['/About.html', '/about'],
    ['/Event.html', '/events'],
    ['/addevent.html', '/events'],
    ['/producer.html', '/admin/login'],
    ['/producermap.html', '/community'],
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

export function handleLegacySiteRedirect(c: Context<AppEnvironment>): Response {
    const destination = LEGACY_SITE_REDIRECTS.get(new URL(c.req.url).pathname);
    return destination ? c.redirect(destination, 301) : c.text('Not Found', 404);
}

export function handleLegacyChronicleRedirect(c: Context<AppEnvironment>): Response {
    const activityId = c.req.query('id')?.trim();
    const destination = activityId && !/[/\\\u0000-\u001f\u007f]/.test(activityId)
        ? `/chronicle/${encodeURIComponent(activityId)}`
        : '/chronicle';
    return c.redirect(destination, 301);
}
