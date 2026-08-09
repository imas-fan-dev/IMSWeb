import type { ImsHonoApp } from '@/app';
import { handleServeSiteIndex } from '@/domains/site/handlers/serve-site-index';
import {
    handleLegacyChronicleRedirect,
    handleLegacySiteRedirect
} from '@/domains/site/handlers/redirect-legacy-site';
import {
    LEGACY_SITE_REDIRECTS,
    validateLegacyChronicleRedirectQuery
} from '@/domains/site/request';
import { queryValidator } from '@/middleware/request-validation';

export function registerSiteRoutes(app: ImsHonoApp): void {
    app.on(['GET', 'HEAD'], '/', handleServeSiteIndex);
    for (const legacyPath of LEGACY_SITE_REDIRECTS.keys()) {
        app.on(['GET', 'HEAD'], legacyPath, handleLegacySiteRedirect);
    }
    app.on(
        ['GET', 'HEAD'],
        '/eventchronicle.html',
        queryValidator(validateLegacyChronicleRedirectQuery),
        handleLegacyChronicleRedirect
    );
}
