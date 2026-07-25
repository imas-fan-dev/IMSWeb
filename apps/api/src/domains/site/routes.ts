import type { ImsHonoApp } from '@/app';
import { handleServeSiteIndex } from '@/domains/site/handlers/serve-site-index';
import {
    handleLegacyChronicleRedirect,
    handleLegacySiteRedirect,
    LEGACY_SITE_REDIRECTS
} from '@/domains/site/handlers/redirect-legacy-site';

export function registerSiteRoutes(app: ImsHonoApp): void {
    app.on(['GET', 'HEAD'], '/', handleServeSiteIndex);
    for (const legacyPath of LEGACY_SITE_REDIRECTS.keys()) {
        app.on(['GET', 'HEAD'], legacyPath, handleLegacySiteRedirect);
    }
    app.on(['GET', 'HEAD'], '/eventchronicle.html', handleLegacyChronicleRedirect);
}
