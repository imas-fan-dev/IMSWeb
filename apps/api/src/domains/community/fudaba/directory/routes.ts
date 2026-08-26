import { optionalPlatformAuth, platformAuth } from '@/middleware/hono-auth';
import {
    requireFudabaMap,
    requireFudabaPublicRead
} from '@/domains/community/fudaba/access-policy';
import {
    createHandleFudabaCardReaction,
    handleListFudabaCardReactions
} from '@/domains/community/fudaba/directory/handlers/card-reactions';
import { handleGetFudabaMapConfig } from '@/domains/community/fudaba/directory/handlers/get-map-config';
import { handleGetFudabaPublicOffice } from '@/domains/community/fudaba/directory/handlers/get-public-office';
import { handleListFudabaFavoriteCards } from '@/domains/community/fudaba/directory/handlers/list-favorite-cards';
import { handleListFudabaMapOffices } from '@/domains/community/fudaba/directory/handlers/list-map-offices';
import { handleListFudabaPublicCards } from '@/domains/community/fudaba/directory/handlers/list-public-cards';
import { handleListFudabaPublicOffices } from '@/domains/community/fudaba/directory/handlers/list-public-offices';
import { handleListFudabaPublicSeries } from '@/domains/community/fudaba/directory/handlers/list-public-series';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function fudabaDirectoryRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/series',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        handleListFudabaPublicSeries
    );
    routes.get(
        '/offices',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        handleListFudabaPublicOffices
    );
    routes.get(
        '/offices/:officeSlug',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        handleGetFudabaPublicOffice
    );
    routes.get(
        '/cards',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        handleListFudabaPublicCards
    );
    routes.get(
        '/cards/:cardId/reactions',
        requireFudabaPublicRead,
        handleListFudabaCardReactions
    );
    routes.post(
        '/cards/:cardId/reactions',
        requireFudabaPublicRead,
        createHandleFudabaCardReaction(1)
    );
    routes.delete(
        '/cards/:cardId/reactions',
        requireFudabaPublicRead,
        createHandleFudabaCardReaction(-1)
    );
    routes.get(
        '/map/config',
        requireFudabaPublicRead,
        requireFudabaMap,
        optionalPlatformAuth,
        handleGetFudabaMapConfig
    );
    routes.get(
        '/map/offices',
        requireFudabaPublicRead,
        requireFudabaMap,
        optionalPlatformAuth,
        handleListFudabaMapOffices
    );
    routes.get('/me/series', platformAuth, handleListFudabaPublicSeries);
    routes.get('/me/favorites', platformAuth, handleListFudabaFavoriteCards);
    return routes;
}
