import type { ImsHonoApp } from '@/app';
import { handleGetAdminProducerMap } from '@/domains/producer-map/handlers/get-admin-producer-map';
import { handleGetProducerMap } from '@/domains/producer-map/handlers/get-producer-map';
import { handleUpdateProducerMap } from '@/domains/producer-map/handlers/update-producer-map';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';

export function registerProducerMapRoutes(app: ImsHonoApp): void {
    app.get('/api/producer-map', handleGetProducerMap);
    app.get('/api/admin/producer-map', coreAuth, opOnly, handleGetAdminProducerMap);
    app.put(
        '/api/admin/producer-map',
        coreAuth,
        opOnly,
        coreCsrf,
        handleUpdateProducerMap
    );
}
