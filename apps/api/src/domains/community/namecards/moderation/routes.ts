import { handleApproveNamecard } from "@/domains/community/namecards/moderation/handlers/approve-namecard";
import { handleDeleteNamecard } from "@/domains/community/namecards/moderation/handlers/delete-namecard";
import { handleListAdminNamecards } from "@/domains/community/namecards/moderation/handlers/list-admin-namecards";
import { handleRejectNamecard } from "@/domains/community/namecards/moderation/handlers/reject-namecard";
import {
    validateAdminNamecardListQuery,
    validateCompatibleNamecardIdParams,
    validateExpectedRevisionQuery,
    validateExpectedRevisionRequest,
} from "@/domains/community/namecards/request";
import {
    backofficeAuth,
    backofficeCsrf,
    opOnly,
} from "@/middleware/hono-auth";
import {
    jsonValidator,
    paramValidator,
    queryValidator,
} from "@/middleware/request-validation";
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from "@/routing/capability-router";

export function namecardModerationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    const namecardIdValidator = paramValidator(
        validateCompatibleNamecardIdParams,
    );
    routes.get(
        "/",
        backofficeAuth,
        opOnly,
        queryValidator(validateAdminNamecardListQuery),
        handleListAdminNamecards,
    );
    routes.post(
        "/approve/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonValidator(validateExpectedRevisionRequest),
        handleApproveNamecard,
    );
    routes.post(
        "/reject/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonValidator(validateExpectedRevisionRequest),
        handleRejectNamecard,
    );
    routes.delete(
        "/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        queryValidator(validateExpectedRevisionQuery),
        handleDeleteNamecard,
    );
    return routes;
}
