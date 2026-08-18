import { handleGetNamecardSubmission } from "@/domains/community/namecards/submissions/handlers/get-submission";
import { handleUploadNamecard } from "@/domains/community/namecards/submissions/handlers/upload-namecard";
import { handleWithdrawNamecardSubmission } from "@/domains/community/namecards/submissions/handlers/withdraw-submission";
import {
    validateExpectedRevisionRequest,
    validateNamecardIdParams,
} from "@/domains/community/namecards/request";
import { jsonValidator, paramValidator } from "@/middleware/request-validation";
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from "@/routing/capability-router";

export function namecardSubmissionRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post("/uploadNameCard", handleUploadNamecard);
    routes.get(
        "/namecards/submissions/:id",
        paramValidator(validateNamecardIdParams),
        handleGetNamecardSubmission,
    );
    routes.post(
        "/namecards/submissions/:id/withdraw",
        paramValidator(validateNamecardIdParams),
        jsonValidator(validateExpectedRevisionRequest),
        handleWithdrawNamecardSubmission,
    );
    return routes;
}
