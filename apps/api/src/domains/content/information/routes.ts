import type { ImsHonoApp } from '@/app';
import { handleCreateInformation } from '@/domains/content/information/handlers/create-information';
import { handleDeleteInformation } from '@/domains/content/information/handlers/delete-information';
import { handleDeleteInformationAsset } from '@/domains/content/information/handlers/delete-information-asset';
import { handleGetInformation } from '@/domains/content/information/handlers/get-information';
import { handleListAdminInformation } from '@/domains/content/information/handlers/list-admin-information';
import { handleListInformation } from '@/domains/content/information/handlers/list-information';
import { handleReorderInformation } from '@/domains/content/information/handlers/reorder-information';
import { handleServeInformationContent } from '@/domains/content/information/handlers/serve-information-content';
import { handleUpdateInformation } from '@/domains/content/information/handlers/update-information';
import { handleUploadInformationAsset } from '@/domains/content/information/handlers/upload-information-asset';
import { validateInformationSubmission } from '@/domains/content/information/content-store';
import {
    validateInformationAssetDeletionRequest,
    validateInformationOrderRequest
} from '@/domains/content/information/data';
import { validateInformationCardParams } from '@/domains/content/information/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonValidator, paramValidator } from '@/middleware/request-validation';

const informationCardParamValidator = paramValidator(validateInformationCardParams);

export function registerInformationRoutes(app: ImsHonoApp): void {
    app.get(
        '/information/:id/content',
        informationCardParamValidator,
        handleServeInformationContent
    );
    app.get('/api/information', handleListInformation);
    app.get('/api/information/:id', informationCardParamValidator, handleGetInformation);
    app.get('/api/admin/information', backofficeAuth, opOnly, handleListAdminInformation);
    app.post(
        '/api/admin/information/assets',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleUploadInformationAsset
    );
    app.post(
        '/api/admin/information',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateInformationSubmission),
        handleCreateInformation
    );
    app.put(
        '/api/admin/information/order',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateInformationOrderRequest),
        handleReorderInformation
    );
    app.put(
        '/api/admin/information/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateInformationSubmission),
        informationCardParamValidator,
        handleUpdateInformation
    );
    app.delete(
        '/api/admin/information/assets',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateInformationAssetDeletionRequest),
        handleDeleteInformationAsset
    );
    app.delete(
        '/api/admin/information/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        informationCardParamValidator,
        handleDeleteInformation
    );
}
