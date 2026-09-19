import {
    fudabaCardIdParamsSchema,
    fudabaCardMediaParamsSchema,
    fudabaIgnoredQuerySchema,
    fudabaCardPlacementDeleteRequestSchema,
    fudabaCardPlacementSaveRequestSchema,
    fudabaCardOfficePlacementParamsSchema,
    fudabaCardUpdateRequestSchema,
    fudabaMediaQuerySchema,
    fudabaRevisionRequestSchema,
} from '@imsweb/contracts/fudaba';
import { publicUploadsPath } from '@imsweb/contracts/paths';
import { activePlatformMutation, platformAuth, platformCsrf } from '@/middleware/hono-auth';
import { requireFudabaWrite } from '@/domains/community/fudaba/access-policy';
import { handleCreateFudabaCard } from '@/domains/community/fudaba/cards/handlers/create-card';
import { handleDeleteFudabaCard } from '@/domains/community/fudaba/cards/handlers/delete-card';
import { handleGetFudabaOwnerCard } from '@/domains/community/fudaba/cards/handlers/get-owner-card';
import { handleListFudabaOwnerCards } from '@/domains/community/fudaba/cards/handlers/list-owner-cards';
import { handleRemoveFudabaCardPlacement } from '@/domains/community/fudaba/cards/handlers/remove-card-placement';
import { handleSaveFudabaCardPlacement } from '@/domains/community/fudaba/cards/handlers/save-card-placement';
import { handleServeFudabaOwnerCardMedia } from '@/domains/community/fudaba/cards/handlers/serve-owner-card-media';
import { createHandleFudabaCardInteraction } from '@/domains/community/fudaba/cards/handlers/set-card-interaction';
import { handleUpdateFudabaCard } from '@/domains/community/fudaba/cards/handlers/update-card';
import { handleUploadFudabaOwnedMedia } from '@/domains/community/fudaba/cards/handlers/upload-owned-media';
import { platformUploadRateLimit, platformWriteRateLimit } from '@/middleware/platform-mutation-limit';
import { jsonSchemaValidator, paramSchemaValidator, querySchemaValidator } from '@/middleware/request-validation';
import { createCapabilityRouter, type ImsCapabilityRouter } from '@/routing/capability-router';

const write = [requireFudabaWrite, platformAuth, activePlatformMutation, platformCsrf, platformWriteRateLimit] as const;

export function fudabaCardRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/me/cards', platformAuth, querySchemaValidator(fudabaIgnoredQuerySchema), handleListFudabaOwnerCards);
    routes.get('/me/cards/:cardId', platformAuth, paramSchemaValidator(fudabaCardIdParamsSchema), querySchemaValidator(fudabaIgnoredQuerySchema), handleGetFudabaOwnerCard);
    for (const method of ['get', 'on'] as const) {
        if (method === 'get') {
            routes.get('/me/cards/:cardId/media/:side', platformAuth, paramSchemaValidator(fudabaCardMediaParamsSchema), querySchemaValidator(fudabaMediaQuerySchema), handleServeFudabaOwnerCardMedia);
        } else {
            routes.on('HEAD', '/me/cards/:cardId/media/:side', platformAuth, paramSchemaValidator(fudabaCardMediaParamsSchema), querySchemaValidator(fudabaMediaQuerySchema), handleServeFudabaOwnerCardMedia);
        }
    }
    routes.post('/cards', requireFudabaWrite, platformAuth, activePlatformMutation, platformCsrf, platformUploadRateLimit, platformWriteRateLimit, handleCreateFudabaCard);
    for (const [path, kind, active] of [
        ['/cards/:cardId/like', 'like', true],
        ['/cards/:cardId/like', 'like', false],
        ['/cards/:cardId/favorite', 'favorite', true],
        ['/cards/:cardId/favorite', 'favorite', false],
    ] as const) {
        const handler = createHandleFudabaCardInteraction(kind, active);
        if (active) routes.put(path, ...write, paramSchemaValidator(fudabaCardIdParamsSchema), handler);
        else routes.delete(path, ...write, paramSchemaValidator(fudabaCardIdParamsSchema), handler);
    }
    routes.put('/me/cards/:cardId', ...write, paramSchemaValidator(fudabaCardIdParamsSchema), jsonSchemaValidator(fudabaCardUpdateRequestSchema), handleUpdateFudabaCard);
    routes.delete('/me/cards/:cardId', ...write, paramSchemaValidator(fudabaCardIdParamsSchema), jsonSchemaValidator(fudabaRevisionRequestSchema), handleDeleteFudabaCard);
    routes.put('/offices/:officeId/cards/:cardId/placement', ...write, paramSchemaValidator(fudabaCardOfficePlacementParamsSchema), jsonSchemaValidator(fudabaCardPlacementSaveRequestSchema), handleSaveFudabaCardPlacement);
    routes.delete('/offices/:officeId/cards/:cardId/placement', ...write, paramSchemaValidator(fudabaCardOfficePlacementParamsSchema), jsonSchemaValidator(fudabaCardPlacementDeleteRequestSchema), handleRemoveFudabaCardPlacement);
    routes.put(publicUploadsPath('/:side'), requireFudabaWrite, platformAuth, activePlatformMutation, platformCsrf, platformUploadRateLimit, handleUploadFudabaOwnedMedia);
    return routes;
}
