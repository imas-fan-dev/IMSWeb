import { handleGetFudabaGuestSubmission } from '@/domains/community/fudaba/guest-submissions/handlers/get-submission';
import { handleCreateFudabaGuestSubmission } from '@/domains/community/fudaba/guest-submissions/handlers/upload-guest-submission';
import { handleServeFudabaGuestSubmissionMedia } from '@/domains/community/fudaba/guest-submissions/handlers/serve-submission-media';
import { handleWithdrawFudabaGuestSubmission } from '@/domains/community/fudaba/guest-submissions/handlers/withdraw-submission';
import {
    validateFudabaGuestSubmissionIdParams,
    validateFudabaGuestSubmissionMediaParams,
    validateFudabaGuestSubmissionWithdrawalRequest,
} from '@/domains/community/fudaba/guest-submissions/request';
import { jsonValidator, paramValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from '@/routing/capability-router';

export function fudabaGuestSubmissionRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post('/guest-submissions', handleCreateFudabaGuestSubmission);
    routes.get(
        '/guest-submissions/:submissionId',
        paramValidator(validateFudabaGuestSubmissionIdParams),
        handleGetFudabaGuestSubmission,
    );
    routes.get(
        '/guest-submissions/:submissionId/media/:side',
        paramValidator(validateFudabaGuestSubmissionMediaParams),
        handleServeFudabaGuestSubmissionMedia,
    );
    routes.on(
        'HEAD',
        '/guest-submissions/:submissionId/media/:side',
        paramValidator(validateFudabaGuestSubmissionMediaParams),
        handleServeFudabaGuestSubmissionMedia,
    );
    routes.post(
        '/guest-submissions/:submissionId/withdraw',
        paramValidator(validateFudabaGuestSubmissionIdParams),
        jsonValidator(validateFudabaGuestSubmissionWithdrawalRequest),
        handleWithdrawFudabaGuestSubmission,
    );
    return routes;
}
