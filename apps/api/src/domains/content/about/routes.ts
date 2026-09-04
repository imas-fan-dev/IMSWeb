import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleGetAboutPage } from '@/domains/content/about/handlers/get-about-page';
import { handleGetAdminAboutPage } from '@/domains/content/about/handlers/get-admin-about-page';
import { handleUploadAboutHeroImage } from '@/domains/content/about/handlers/upload-about-hero-image';
import { handleUploadAboutMemberAvatar } from '@/domains/content/about/handlers/upload-about-member-avatar';
import { handleUpdateAboutPage } from '@/domains/content/about/handlers/update-about-page';
import { validateAboutPageUpdateRequest } from '@/domains/content/about/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonValidator } from '@/middleware/request-validation';

export function registerAboutRoutes(app: ImsHonoApp): void {
    app.get(apiPath('/about'), handleGetAboutPage);
    app.get(adminApiPath('/about'), backofficeAuth, opOnly, handleGetAdminAboutPage);
    app.post(
        adminApiPath('/about/hero-image'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleUploadAboutHeroImage
    );
    app.post(
        adminApiPath('/about/member-avatar'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleUploadAboutMemberAvatar
    );
    app.put(
        adminApiPath('/about'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateAboutPageUpdateRequest, {
            malformedMessage: '请求正文必须为 JSON'
        }),
        handleUpdateAboutPage
    );
}
