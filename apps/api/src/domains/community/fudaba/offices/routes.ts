import {
    fudabaIgnoredQuerySchema,
    fudabaMediaQuerySchema,
    fudabaOfficeFieldsRequestSchema,
    fudabaOfficeIdParamsSchema,
    fudabaOfficeUpdateRequestSchema,
    fudabaRevisionRequestSchema,
} from '@imsweb/contracts/fudaba';
import { activePlatformMutation, platformAuth, platformCsrf } from '@/middleware/hono-auth';
import { requireFudabaWrite } from '@/domains/community/fudaba/access-policy';
import { handleArchiveFudabaOwnerOffice } from '@/domains/community/fudaba/offices/handlers/archive-owner-office';
import { handleCreateFudabaOffice } from '@/domains/community/fudaba/offices/handlers/create-office';
import { handleGetFudabaOwnerOffice } from '@/domains/community/fudaba/offices/handlers/get-owner-office';
import { handleListFudabaOwnerOffices } from '@/domains/community/fudaba/offices/handlers/list-owner-offices';
import {
    handleServeFudabaOwnerOfficeCover,
    handleServeFudabaOwnerOfficePendingCover
} from '@/domains/community/fudaba/offices/handlers/serve-owner-office-media';
import { handleRestoreFudabaOwnerOffice } from '@/domains/community/fudaba/offices/handlers/restore-owner-office';
import { handleUpdateFudabaOwnerOffice } from '@/domains/community/fudaba/offices/handlers/update-owner-office';
import { handleUploadFudabaOfficeCover } from '@/domains/community/fudaba/offices/handlers/upload-office-cover';
import { handleWithdrawFudabaOfficeCover } from '@/domains/community/fudaba/offices/handlers/withdraw-office-cover';
import {
    platformUploadRateLimit,
    platformWriteRateLimit
} from '@/middleware/platform-mutation-limit';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator,
} from '@/middleware/request-validation';
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

export function fudabaOfficeRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/me/offices', platformAuth, querySchemaValidator(fudabaIgnoredQuerySchema), handleListFudabaOwnerOffices);
    routes.get(
        '/me/offices/:officeId',
        platformAuth,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        querySchemaValidator(fudabaIgnoredQuerySchema),
        handleGetFudabaOwnerOffice
    );
    routes.get(
        '/me/offices/:officeId/media/cover',
        platformAuth,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        querySchemaValidator(fudabaMediaQuerySchema),
        handleServeFudabaOwnerOfficeCover
    );
    routes.on(
        'HEAD',
        '/me/offices/:officeId/media/cover',
        platformAuth,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        querySchemaValidator(fudabaMediaQuerySchema),
        handleServeFudabaOwnerOfficeCover
    );
    routes.get(
        '/me/offices/:officeId/media/pending-cover',
        platformAuth,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        querySchemaValidator(fudabaMediaQuerySchema),
        handleServeFudabaOwnerOfficePendingCover
    );
    routes.on(
        'HEAD',
        '/me/offices/:officeId/media/pending-cover',
        platformAuth,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        querySchemaValidator(fudabaMediaQuerySchema),
        handleServeFudabaOwnerOfficePendingCover
    );
    routes.post('/offices', ...write, jsonSchemaValidator(fudabaOfficeFieldsRequestSchema), handleCreateFudabaOffice);
    routes.put(
        '/me/offices/:officeId',
        ...write,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        jsonSchemaValidator(fudabaOfficeUpdateRequestSchema),
        handleUpdateFudabaOwnerOffice
    );
    routes.delete(
        '/me/offices/:officeId',
        ...write,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        jsonSchemaValidator(fudabaRevisionRequestSchema),
        handleArchiveFudabaOwnerOffice
    );
    routes.post(
        '/me/offices/:officeId/restore',
        ...write,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        jsonSchemaValidator(fudabaRevisionRequestSchema),
        handleRestoreFudabaOwnerOffice
    );
    routes.put(
        '/me/offices/:officeId/cover',
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformUploadRateLimit,
        platformWriteRateLimit,
        handleUploadFudabaOfficeCover
    );
    routes.delete(
        '/me/offices/:officeId/cover/pending',
        ...write,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        jsonSchemaValidator(fudabaRevisionRequestSchema),
        handleWithdrawFudabaOfficeCover
    );
    return routes;
}
