import {
    fudabaMessageCreateRequestSchema,
    fudabaMessageEditRequestSchema,
    fudabaMessagePlacementRequestSchema,
    fudabaMessageModerationRequestSchema,
    fudabaMessageIdParamsSchema,
    fudabaMessageOfficeParamsSchema,
    fudabaMessageSlugParamsSchema,
    fudabaMessageListQuerySchema,
    fudabaMixedWallQuerySchema,
} from '@imsweb/contracts/fudaba/messages';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf,
    optionalPlatformAuth,
    backofficeAuth,
    backofficeCsrf,
    superAdminOnly,
} from '@/middleware/hono-auth';
import { platformWriteRateLimit } from '@/middleware/platform-mutation-limit';
import {
    requireFudabaPublicRead,
    requireFudabaWrite,
} from '@/domains/community/fudaba/access-policy';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator,
} from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from '@/routing/capability-router';
import {
    handleReadMixedWall,
    handleReadWallLayout,
    handleReadWallScene,
} from '@/domains/community/fudaba/messages/handlers/read-mixed-wall';
import { handleCreateMessage } from '@/domains/community/fudaba/messages/handlers/create-message';
import { handleEditMessage } from '@/domains/community/fudaba/messages/handlers/edit-message';
import { handlePlaceMessage } from '@/domains/community/fudaba/messages/handlers/place-message';
import { handleDestroyMessage } from '@/domains/community/fudaba/messages/handlers/destroy-message';
import { handleModerateMessage } from '@/domains/community/fudaba/messages/handlers/moderate-message';
import { handleListMessages } from '@/domains/community/fudaba/messages/handlers/list-messages';
import { handleReadPrivateMessage } from '@/domains/community/fudaba/messages/handlers/read-private-message';

export function fudabaMessageRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    const write = [
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformWriteRateLimit,
    ] as const;
    routes.get(
        '/offices/:slug/mixed-wall',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        paramSchemaValidator(fudabaMessageSlugParamsSchema),
        querySchemaValidator(fudabaMixedWallQuerySchema),
        handleReadMixedWall
    );
    routes.get(
        '/offices/:slug/wall-layout',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        paramSchemaValidator(fudabaMessageSlugParamsSchema),
        querySchemaValidator(fudabaMixedWallQuerySchema),
        handleReadWallLayout
    );
    routes.get(
        '/offices/:slug/wall-scene',
        requireFudabaPublicRead,
        optionalPlatformAuth,
        paramSchemaValidator(fudabaMessageSlugParamsSchema),
        querySchemaValidator(fudabaMixedWallQuerySchema),
        handleReadWallScene
    );
    routes.get(
        '/messages/:messageId',
        platformAuth,
        paramSchemaValidator(fudabaMessageIdParamsSchema),
        handleReadPrivateMessage
    );
    routes.get(
        '/me/messages',
        platformAuth,
        querySchemaValidator(fudabaMessageListQuerySchema),
        handleListMessages('mine')
    );
    routes.get(
        '/offices/:officeId/messages',
        platformAuth,
        paramSchemaValidator(fudabaMessageOfficeParamsSchema),
        querySchemaValidator(fudabaMessageListQuerySchema),
        handleListMessages('office')
    );
    routes.post(
        '/offices/:officeId/messages',
        ...write,
        paramSchemaValidator(fudabaMessageOfficeParamsSchema),
        jsonSchemaValidator(fudabaMessageCreateRequestSchema),
        handleCreateMessage
    );
    routes.put(
        '/messages/:messageId',
        ...write,
        paramSchemaValidator(fudabaMessageIdParamsSchema),
        jsonSchemaValidator(fudabaMessageEditRequestSchema),
        handleEditMessage
    );
    routes.put(
        '/messages/:messageId/placement',
        ...write,
        paramSchemaValidator(fudabaMessageIdParamsSchema),
        jsonSchemaValidator(fudabaMessagePlacementRequestSchema),
        handlePlaceMessage
    );
    routes.delete(
        '/messages/:messageId',
        ...write,
        paramSchemaValidator(fudabaMessageIdParamsSchema),
        handleDestroyMessage
    );
    routes.put(
        '/messages/:messageId/office-moderation',
        ...write,
        paramSchemaValidator(fudabaMessageIdParamsSchema),
        jsonSchemaValidator(fudabaMessageModerationRequestSchema),
        handleModerateMessage('office')
    );
    return routes;
}
export function fudabaAdminMessageRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/messages',
        backofficeAuth,
        superAdminOnly,
        querySchemaValidator(fudabaMessageListQuerySchema),
        handleListMessages('admin')
    );
    routes.put(
        '/messages/:messageId/moderation',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        paramSchemaValidator(fudabaMessageIdParamsSchema),
        jsonSchemaValidator(fudabaMessageModerationRequestSchema),
        handleModerateMessage('admin')
    );
    return routes;
}
