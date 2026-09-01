import { handleGetLegacyInformationPost } from '@/domains/content/editorial/spotlight/handlers/get-legacy-information-post';
import { handleListAdminSpotlight } from '@/domains/content/editorial/spotlight/handlers/list-admin-spotlight';
import { handleListPublicSpotlight } from '@/domains/content/editorial/spotlight/handlers/list-public-spotlight';
import { handleReplaceAdminSpotlight } from '@/domains/content/editorial/spotlight/handlers/replace-spotlight';
import {
    validateLegacyInformationParams,
    validateSpotlightSelection
} from '@/domains/content/editorial/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonValidator, paramValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

const legacyInformationParams = paramValidator(validateLegacyInformationParams);
const spotlightSelection = jsonValidator(validateSpotlightSelection);

export function editorialPublicSpotlightRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/community-posts/spotlight', handleListPublicSpotlight);
    routes.get(
        '/community-posts/legacy-information/:id',
        legacyInformationParams,
        handleGetLegacyInformationPost
    );
    return routes;
}

/** 必须在社区帖子的 /:id 路由之前挂载，否则 spotlight 会被当成一个帖子 ID。 */
export function editorialAdminSpotlightRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/community-posts/spotlight',
        backofficeAuth,
        opOnly,
        handleListAdminSpotlight
    );
    routes.put(
        '/community-posts/spotlight',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        spotlightSelection,
        handleReplaceAdminSpotlight
    );
    return routes;
}
