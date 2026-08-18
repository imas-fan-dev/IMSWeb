import type { ImsHonoApp } from '@/app';
import { handleGetAdminProducerMap } from '@/domains/content/producer-map/handlers/get-admin-producer-map';
import { handleGetProducerMap } from '@/domains/content/producer-map/handlers/get-producer-map';
import { handleUploadProducerMapImage } from '@/domains/content/producer-map/handlers/upload-producer-map-image';
import { handleUpdateProducerMap } from '@/domains/content/producer-map/handlers/update-producer-map';
import { validateProducerMapUpdateRequest } from '@/domains/content/producer-map/data';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonValidator } from '@/middleware/request-validation';

export function registerProducerMapRoutes(app: ImsHonoApp): void {
    app.get('/api/producer-map', handleGetProducerMap);
    app.get('/api/admin/producer-map', backofficeAuth, opOnly, handleGetAdminProducerMap);
    app.post(
        '/api/admin/producer-map/images',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleUploadProducerMapImage
    );
    app.put(
        '/api/admin/producer-map',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateProducerMapUpdateRequest, {
            malformedMessage: '请求正文必须为 JSON'
        }),
        handleUpdateProducerMap
    );
}
