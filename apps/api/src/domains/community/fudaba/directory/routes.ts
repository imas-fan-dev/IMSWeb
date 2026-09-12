import {
    fudabaCardIdParamsSchema,
    fudabaCardQuerySchema,
    fudabaEmptyQuerySchema,
    fudabaMapQuerySchema,
    fudabaOfficeQuerySchema,
    fudabaOfficeSlugParamsSchema,
    fudabaReactionRequestSchema,
} from '@imsweb/contracts/fudaba';
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
import { jsonSchemaValidator, paramSchemaValidator, querySchemaValidator } from '@/middleware/request-validation';
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
        querySchemaValidator(fudabaEmptyQuerySchema),
        handleListFudabaPublicSeries
    );
    routes.get(
        '/offices',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        querySchemaValidator(fudabaOfficeQuerySchema),
        handleListFudabaPublicOffices
    );
    routes.get(
        '/offices/:officeSlug',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        paramSchemaValidator(fudabaOfficeSlugParamsSchema),
        querySchemaValidator(fudabaEmptyQuerySchema),
        handleGetFudabaPublicOffice
    );
    routes.get(
        '/cards',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        querySchemaValidator(fudabaCardQuerySchema),
        handleListFudabaPublicCards
    );
    routes.get(
        '/cards/:cardId/reactions',
        requireFudabaPublicRead,
        paramSchemaValidator(fudabaCardIdParamsSchema),
        handleListFudabaCardReactions
    );
    routes.post(
        '/cards/:cardId/reactions',
        requireFudabaPublicRead,
        paramSchemaValidator(fudabaCardIdParamsSchema),
        jsonSchemaValidator(fudabaReactionRequestSchema, { acceptMislabeledJson: true }),
        createHandleFudabaCardReaction(1)
    );
    routes.delete(
        '/cards/:cardId/reactions',
        requireFudabaPublicRead,
        paramSchemaValidator(fudabaCardIdParamsSchema),
        jsonSchemaValidator(fudabaReactionRequestSchema, { acceptMislabeledJson: true }),
        createHandleFudabaCardReaction(-1)
    );
    routes.get(
        '/map/config',
        requireFudabaPublicRead,
        requireFudabaMap,
        optionalPlatformAuth,
        querySchemaValidator(fudabaEmptyQuerySchema),
        handleGetFudabaMapConfig
    );
    routes.get(
        '/map/offices',
        requireFudabaPublicRead,
        requireFudabaMap,
        optionalPlatformAuth,
        querySchemaValidator(fudabaMapQuerySchema),
        handleListFudabaMapOffices
    );
    routes.get('/me/series', platformAuth, querySchemaValidator(fudabaEmptyQuerySchema), handleListFudabaPublicSeries);
    routes.get('/me/favorites', platformAuth, querySchemaValidator(fudabaCardQuerySchema), handleListFudabaFavoriteCards);
    return routes;
}
