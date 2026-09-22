import {
    fudabaGuestSubmissionMediaParamsSchema,
    fudabaGuestSubmissionParamsSchema,
    fudabaGuestSubmissionWithdrawalRequestSchema,
} from '@imsweb/contracts/fudaba/guest-submissions';
import { handleGetFudabaGuestSubmission } from '@/domains/community/fudaba/guest-submissions/handlers/get-submission';
import { handleCreateFudabaGuestSubmission } from '@/domains/community/fudaba/guest-submissions/handlers/upload-guest-submission';
import { handleServeFudabaGuestSubmissionMedia } from '@/domains/community/fudaba/guest-submissions/handlers/serve-submission-media';
import { handleWithdrawFudabaGuestSubmission } from '@/domains/community/fudaba/guest-submissions/handlers/withdraw-submission';
import {
    validateFudabaGuestSubmissionIdParams,
    validateFudabaGuestSubmissionMediaParams,
    validateFudabaGuestSubmissionWithdrawalRequest,
} from '@/domains/community/fudaba/guest-submissions/request';
import { jsonSchemaValidator, paramSchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from '@/routing/capability-router';

export function fudabaGuestSubmissionRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post('/guest-submissions', handleCreateFudabaGuestSubmission);
    routes.get(
        '/guest-submissions/:submissionId',
        paramSchemaValidator(fudabaGuestSubmissionParamsSchema, { invalidMessage: '名片 ID 无效' }, validateFudabaGuestSubmissionIdParams),
        handleGetFudabaGuestSubmission,
    );
    routes.get(
        '/guest-submissions/:submissionId/media/:side',
        paramSchemaValidator(fudabaGuestSubmissionMediaParamsSchema, { invalidMessage: '名片媒体参数无效' }, validateFudabaGuestSubmissionMediaParams),
        handleServeFudabaGuestSubmissionMedia,
    );
    routes.on(
        'HEAD',
        '/guest-submissions/:submissionId/media/:side',
        paramSchemaValidator(fudabaGuestSubmissionMediaParamsSchema, { invalidMessage: '名片媒体参数无效' }, validateFudabaGuestSubmissionMediaParams),
        handleServeFudabaGuestSubmissionMedia,
    );
    routes.post(
        '/guest-submissions/:submissionId/withdraw',
        paramSchemaValidator(fudabaGuestSubmissionParamsSchema, { invalidMessage: '名片 ID 无效' }, validateFudabaGuestSubmissionIdParams),
        jsonSchemaValidator(fudabaGuestSubmissionWithdrawalRequestSchema, { invalidMessage: 'expectedRevision must be a non-negative integer' }, validateFudabaGuestSubmissionWithdrawalRequest),
        handleWithdrawFudabaGuestSubmission,
    );
    return routes;
}
