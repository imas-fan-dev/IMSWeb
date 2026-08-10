import type { ImsHonoApp } from '@/app';
import { handleCreateNews } from '@/domains/news/handlers/create-news';
import { handleDeleteNews } from '@/domains/news/handlers/delete-news';
import { handleListAdminNews } from '@/domains/news/handlers/list-admin-news';
import { handleListPublicNews } from '@/domains/news/handlers/list-public-news';
import {
    validateCompatibleNewsDeleteParams,
    validateNewsListQuery
} from '@/domains/news/request';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator, queryValidator } from '@/middleware/request-validation';

export function registerNewsRoutes(app: ImsHonoApp): void {
    app.get('/api/news', queryValidator(validateNewsListQuery), handleListPublicNews);
    app.get('/api/admin/news', coreAuth, opOnly, handleListAdminNews);
    app.post('/api/admin/news', coreAuth, opOnly, coreCsrf, handleCreateNews);
    app.delete(
        '/api/admin/news/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        paramValidator(validateCompatibleNewsDeleteParams),
        handleDeleteNews
    );
}
