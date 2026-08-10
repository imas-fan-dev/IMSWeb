import type { ImsHonoApp } from '@/app';
import { handleApproveNamecard } from '@/domains/namecards/handlers/approve-namecard';
import { handleDeleteNamecard } from '@/domains/namecards/handlers/delete-namecard';
import { handleGetNamecard } from '@/domains/namecards/handlers/get-namecard';
import { handleListAdminNamecards } from '@/domains/namecards/handlers/list-admin-namecards';
import { handleListNamecards } from '@/domains/namecards/handlers/list-namecards';
import { handleUploadNamecard } from '@/domains/namecards/handlers/upload-namecard';
import {
    validateAdminNamecardListQuery,
    validateCompatibleNamecardIdParams,
    validateNamecardListQuery
} from '@/domains/namecards/request';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator, queryValidator } from '@/middleware/request-validation';

const namecardIdValidator = paramValidator(validateCompatibleNamecardIdParams);

export function registerNamecardRoutes(app: ImsHonoApp): void {
    app.post('/api/uploadNameCard', handleUploadNamecard);
    app.get('/api/cards', queryValidator(validateNamecardListQuery), handleListNamecards);
    app.get('/api/card/:id', namecardIdValidator, handleGetNamecard);
    app.get(
        '/api/admin/cards',
        coreAuth,
        opOnly,
        queryValidator(validateAdminNamecardListQuery),
        handleListAdminNamecards
    );
    app.post(
        '/api/admin/cards/approve/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        namecardIdValidator,
        handleApproveNamecard
    );
    app.delete(
        '/api/admin/cards/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        namecardIdValidator,
        handleDeleteNamecard
    );
}
