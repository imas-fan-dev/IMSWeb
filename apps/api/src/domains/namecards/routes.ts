import type { ImsHonoApp } from '@/app';
import { handleApproveNamecard } from '@/domains/namecards/handlers/approve-namecard';
import { handleDeleteNamecard } from '@/domains/namecards/handlers/delete-namecard';
import { handleGetNamecard } from '@/domains/namecards/handlers/get-namecard';
import { handleListAdminNamecards } from '@/domains/namecards/handlers/list-admin-namecards';
import { handleListNamecards } from '@/domains/namecards/handlers/list-namecards';
import { handleRejectNamecard } from '@/domains/namecards/handlers/reject-namecard';
import { handleUploadNamecard } from '@/domains/namecards/handlers/upload-namecard';
import { handleGetNamecardSubmission } from '@/domains/namecards/handlers/get-submission';
import { handleWithdrawNamecardSubmission } from '@/domains/namecards/handlers/withdraw-submission';
import { handleReplaceNamecardSubmissionImage } from '@/domains/namecards/handlers/replace-submission-image';
import { handleResubmitNamecardSubmission } from '@/domains/namecards/handlers/resubmit-submission';
import {
    validateAdminNamecardListQuery,
    validateCompatibleNamecardIdParams,
    validateExpectedRevisionQuery,
    validateExpectedRevisionRequest,
    validateNamecardIdParams,
    validateNamecardImageSideParams,
    validateNamecardListQuery
} from '@/domains/namecards/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonValidator, paramValidator, queryValidator } from '@/middleware/request-validation';

const namecardIdValidator = paramValidator(validateCompatibleNamecardIdParams);
const strictNamecardIdValidator = paramValidator(validateNamecardIdParams);

export function registerNamecardRoutes(app: ImsHonoApp): void {
    app.post('/api/uploadNameCard', handleUploadNamecard);
    app.get('/api/cards', queryValidator(validateNamecardListQuery), handleListNamecards);
    app.get('/api/card/:id', namecardIdValidator, handleGetNamecard);
    app.get(
        '/api/namecards/submissions/:id',
        strictNamecardIdValidator,
        handleGetNamecardSubmission
    );
    app.post(
        '/api/namecards/submissions/:id/withdraw',
        strictNamecardIdValidator,
        jsonValidator(validateExpectedRevisionRequest),
        handleWithdrawNamecardSubmission
    );
    app.post(
        '/api/namecards/submissions/:id/images/:side',
        paramValidator(validateNamecardImageSideParams),
        queryValidator(validateExpectedRevisionQuery),
        handleReplaceNamecardSubmissionImage
    );
    app.post(
        '/api/namecards/submissions/:id/resubmit',
        strictNamecardIdValidator,
        jsonValidator(validateExpectedRevisionRequest),
        handleResubmitNamecardSubmission
    );
    app.get(
        '/api/admin/cards',
        backofficeAuth,
        opOnly,
        queryValidator(validateAdminNamecardListQuery),
        handleListAdminNamecards
    );
    app.post(
        '/api/admin/cards/approve/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonValidator(validateExpectedRevisionRequest),
        handleApproveNamecard
    );
    app.post(
        '/api/admin/cards/reject/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonValidator(validateExpectedRevisionRequest),
        handleRejectNamecard
    );
    app.delete(
        '/api/admin/cards/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        queryValidator(validateExpectedRevisionQuery),
        handleDeleteNamecard
    );
}
