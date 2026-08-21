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
import { handleUpdateFudabaCard } from '@/domains/community/fudaba/cards/handlers/update-card';
import { handleUploadFudabaOwnedMedia } from '@/domains/community/fudaba/cards/handlers/upload-owned-media';
import {
    platformUploadRateLimit,
    platformWriteRateLimit
} from '@/middleware/platform-mutation-limit';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

const write = [
    requireFudabaWrite,
    platformAuth,
    activePlatformMutation,
    platformCsrf,
    platformWriteRateLimit
] as const;

export function fudabaCardRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/me/cards', platformAuth, handleListFudabaOwnerCards);
    routes.get('/me/cards/:cardId', platformAuth, handleGetFudabaOwnerCard);
    routes.get(
        '/me/cards/:cardId/media/:side',
        platformAuth,
        handleServeFudabaOwnerCardMedia
    );
    routes.on(
        'HEAD',
        '/me/cards/:cardId/media/:side',
        platformAuth,
        handleServeFudabaOwnerCardMedia
    );
    routes.post(
        '/cards',
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformUploadRateLimit,
        platformWriteRateLimit,
        handleCreateFudabaCard
    );
    routes.put('/me/cards/:cardId', ...write, handleUpdateFudabaCard);
    routes.delete('/me/cards/:cardId', ...write, handleDeleteFudabaCard);
    routes.put(
        '/offices/:officeId/cards/:cardId/placement',
        ...write,
        handleSaveFudabaCardPlacement
    );
    routes.delete(
        '/offices/:officeId/cards/:cardId/placement',
        ...write,
        handleRemoveFudabaCardPlacement
    );
    routes.put(
        publicUploadsPath('/:side'),
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformUploadRateLimit,
        handleUploadFudabaOwnedMedia
    );
    return routes;
}
