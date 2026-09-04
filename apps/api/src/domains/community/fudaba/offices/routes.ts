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
    routes.get('/me/offices', platformAuth, handleListFudabaOwnerOffices);
    routes.get(
        '/me/offices/:officeId',
        platformAuth,
        handleGetFudabaOwnerOffice
    );
    routes.get(
        '/me/offices/:officeId/media/cover',
        platformAuth,
        handleServeFudabaOwnerOfficeCover
    );
    routes.on(
        'HEAD',
        '/me/offices/:officeId/media/cover',
        platformAuth,
        handleServeFudabaOwnerOfficeCover
    );
    routes.get(
        '/me/offices/:officeId/media/pending-cover',
        platformAuth,
        handleServeFudabaOwnerOfficePendingCover
    );
    routes.on(
        'HEAD',
        '/me/offices/:officeId/media/pending-cover',
        platformAuth,
        handleServeFudabaOwnerOfficePendingCover
    );
    routes.post('/offices', ...write, handleCreateFudabaOffice);
    routes.put(
        '/me/offices/:officeId',
        ...write,
        handleUpdateFudabaOwnerOffice
    );
    routes.delete(
        '/me/offices/:officeId',
        ...write,
        handleArchiveFudabaOwnerOffice
    );
    routes.post(
        '/me/offices/:officeId/restore',
        ...write,
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
        handleWithdrawFudabaOfficeCover
    );
    return routes;
}
