import { handleDeleteArticleAsset } from '@/domains/content/editorial/assets/handlers/delete-article-asset';
import { handleListArticleAssets } from '@/domains/content/editorial/assets/handlers/list-article-assets';
import { handleUploadArticleAsset } from '@/domains/content/editorial/assets/handlers/upload-article-asset';
import { validateArticleAssetParams } from '@/domains/content/editorial/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

const assetParams = paramValidator(validateArticleAssetParams);

export function editorialAssetRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/articles/:articleId/assets',
        backofficeAuth,
        opOnly,
        assetParams,
        handleListArticleAssets
    );
    routes.post(
        '/articles/:articleId/assets',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        assetParams,
        handleUploadArticleAsset
    );
    routes.delete(
        '/articles/:articleId/assets/:assetId',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        assetParams,
        handleDeleteArticleAsset
    );
    return routes;
}
