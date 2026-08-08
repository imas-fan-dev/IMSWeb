import type { ImsHonoApp } from '@/app';
import { handleCreateInformation } from '@/domains/information/handlers/create-information';
import { handleDeleteInformation } from '@/domains/information/handlers/delete-information';
import { handleDeleteInformationAsset } from '@/domains/information/handlers/delete-information-asset';
import { handleGetInformation } from '@/domains/information/handlers/get-information';
import { handleListAdminInformation } from '@/domains/information/handlers/list-admin-information';
import { handleListInformation } from '@/domains/information/handlers/list-information';
import { handleReorderInformation } from '@/domains/information/handlers/reorder-information';
import { handleServeInformationContent } from '@/domains/information/handlers/serve-information-content';
import { handleUpdateInformation } from '@/domains/information/handlers/update-information';
import { handleUploadInformationAsset } from '@/domains/information/handlers/upload-information-asset';
import { validateInformationSubmission } from '@/domains/information/content-store';
import {
    validateInformationAssetDeletionRequest,
    validateInformationOrderRequest
} from '@/domains/information/data';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonValidator } from '@/middleware/request-validation';

export function registerInformationRoutes(app: ImsHonoApp): void {
    app.get('/information/:id/content', handleServeInformationContent);
    app.get('/api/information', handleListInformation);
    app.get('/api/information/:id', handleGetInformation);
    app.get('/api/admin/information', coreAuth, opOnly, handleListAdminInformation);
    app.post(
        '/api/admin/information/assets',
        coreAuth,
        opOnly,
        coreCsrf,
        handleUploadInformationAsset
    );
    app.post(
        '/api/admin/information',
        coreAuth,
        opOnly,
        coreCsrf,
        jsonValidator(validateInformationSubmission),
        handleCreateInformation
    );
    app.put(
        '/api/admin/information/order',
        coreAuth,
        opOnly,
        coreCsrf,
        jsonValidator(validateInformationOrderRequest),
        handleReorderInformation
    );
    app.put(
        '/api/admin/information/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        jsonValidator(validateInformationSubmission),
        handleUpdateInformation
    );
    app.delete(
        '/api/admin/information/assets',
        coreAuth,
        opOnly,
        coreCsrf,
        jsonValidator(validateInformationAssetDeletionRequest),
        handleDeleteInformationAsset
    );
    app.delete('/api/admin/information/:id', coreAuth, opOnly, coreCsrf, handleDeleteInformation);
}
