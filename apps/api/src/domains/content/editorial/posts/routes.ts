import { handleCreateCommunityPost } from '@/domains/content/editorial/posts/handlers/create-post';
import { handleDeleteCommunityPost } from '@/domains/content/editorial/posts/handlers/delete-post';
import { handleGetCommunityPost } from '@/domains/content/editorial/posts/handlers/get-post';
import { handleListCommunityPosts } from '@/domains/content/editorial/posts/handlers/list-posts';
import { handlePreviewCommunityPost } from '@/domains/content/editorial/posts/handlers/preview-post';
import { createHandleCommunityPostStatus } from '@/domains/content/editorial/posts/handlers/set-post-status';
import { handleUpdateCommunityPost } from '@/domains/content/editorial/posts/handlers/update-post';
import {
    validateEditorialArticlePayload,
    validateEditorialIdParams,
    validateEditorialStatusQuery
} from '@/domains/content/editorial/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import {
    jsonValidator,
    paramValidator,
    queryValidator
} from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

// 社区帖子后台开在两个地址上：community-posts 是新入口，events 是活动编辑器
// 的旧地址，两者共用同一组 handler。
const POST_BASE_PATHS = ['/community-posts', '/events'] as const;

const idParams = paramValidator(validateEditorialIdParams);
const statusQuery = queryValidator(validateEditorialStatusQuery);
const articlePayload = jsonValidator(validateEditorialArticlePayload);

const read = [backofficeAuth, opOnly] as const;
const write = [backofficeAuth, opOnly, backofficeCsrf] as const;

export function editorialPostRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    for (const base of POST_BASE_PATHS) {
        routes.get(base, ...read, statusQuery, handleListCommunityPosts);
        routes.post(base, ...write, articlePayload, handleCreateCommunityPost);
        routes.get(`${base}/:id`, ...read, idParams, handleGetCommunityPost);
        routes.put(
            `${base}/:id`,
            ...write,
            idParams,
            articlePayload,
            handleUpdateCommunityPost
        );
        routes.delete(`${base}/:id`, ...write, idParams, handleDeleteCommunityPost);
        routes.post(
            `${base}/:id/preview`,
            ...write,
            idParams,
            articlePayload,
            handlePreviewCommunityPost
        );
        routes.post(
            `${base}/:id/publish`,
            ...write,
            idParams,
            articlePayload,
            createHandleCommunityPostStatus('published')
        );
        routes.post(
            `${base}/:id/unpublish`,
            ...write,
            idParams,
            articlePayload,
            createHandleCommunityPostStatus('draft')
        );
        routes.post(
            `${base}/:id/archive`,
            ...write,
            idParams,
            articlePayload,
            createHandleCommunityPostStatus('archived')
        );
    }
    return routes;
}
