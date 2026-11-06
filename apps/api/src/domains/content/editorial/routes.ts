import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { editorialAssetRoutes } from '@/domains/content/editorial/assets/routes';
import {
    editorialAdminChronicleRoutes,
    editorialPublicChronicleRoutes
} from '@/domains/content/editorial/chronicle/routes';
import { editorialPostRoutes } from '@/domains/content/editorial/posts/routes';
import {
    editorialAdminSpotlightRoutes,
    editorialPublicSpotlightRoutes
} from '@/domains/content/editorial/spotlight/routes';

const API_PREFIX = apiPath();
const ADMIN_API_PREFIX = adminApiPath();

export function registerEditorialRoutes(app: ImsHonoApp): void {
    app.route(API_PREFIX, editorialPublicChronicleRoutes());
    app.route(API_PREFIX, editorialPublicSpotlightRoutes());
    // spotlight 必须排在社区帖子的 /:id 之前，否则会被当成帖子 ID 命中。
    app.route(ADMIN_API_PREFIX, editorialAdminSpotlightRoutes());
    app.route(ADMIN_API_PREFIX, editorialPostRoutes());
    app.route(ADMIN_API_PREFIX, editorialAdminChronicleRoutes());
    app.route(ADMIN_API_PREFIX, editorialAssetRoutes());
}
