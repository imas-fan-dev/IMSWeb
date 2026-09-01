import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleGetInformation } from '@/domains/content/information/handlers/get-information';
import { handleListInformation } from '@/domains/content/information/handlers/list-information';
import { handleRetiredAdminInformation } from '@/domains/content/information/handlers/retire-admin-information';
import { handleServeInformationContent } from '@/domains/content/information/handlers/serve-information-content';
import { validateInformationCardParams } from '@/domains/content/information/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator } from '@/middleware/request-validation';

const informationCardParamValidator = paramValidator(validateInformationCardParams);

export function registerInformationRoutes(app: ImsHonoApp): void {
    app.get(
        '/information/:id/content',
        informationCardParamValidator,
        handleServeInformationContent
    );
    app.get(apiPath('/information'), handleListInformation);
    app.get(apiPath('/information/:id'), informationCardParamValidator, handleGetInformation);
    app.get(
        adminApiPath('/information'),
        backofficeAuth,
        opOnly,
        handleRetiredAdminInformation
    );
    app.post(
        adminApiPath('/information'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleRetiredAdminInformation
    );
    app.put(
        adminApiPath('/information/order'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleRetiredAdminInformation
    );
    app.put(
        adminApiPath('/information/:id'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleRetiredAdminInformation
    );
    app.delete(
        adminApiPath('/information/:id'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleRetiredAdminInformation
    );
    app.post(
        adminApiPath('/information/assets'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleRetiredAdminInformation
    );
    app.delete(
        adminApiPath('/information/assets'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleRetiredAdminInformation
    );
}
