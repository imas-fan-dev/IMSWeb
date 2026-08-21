import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleCreateNews } from '@/domains/content/news/handlers/create-news';
import { handleDeleteNews } from '@/domains/content/news/handlers/delete-news';
import { handleListAdminNews } from '@/domains/content/news/handlers/list-admin-news';
import { handleListPublicNews } from '@/domains/content/news/handlers/list-public-news';
import {
    validateCompatibleNewsDeleteParams,
    validateNewsListQuery
} from '@/domains/content/news/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator, queryValidator } from '@/middleware/request-validation';

export function registerNewsRoutes(app: ImsHonoApp): void {
    app.get(apiPath('/news'), queryValidator(validateNewsListQuery), handleListPublicNews);
    app.get(adminApiPath('/news'), backofficeAuth, opOnly, handleListAdminNews);
    app.post(adminApiPath('/news'), backofficeAuth, opOnly, backofficeCsrf, handleCreateNews);
    app.delete(
        adminApiPath('/news/:id'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramValidator(validateCompatibleNewsDeleteParams),
        handleDeleteNews
    );
}
