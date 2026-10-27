import { handleApproveNamecard } from "@/domains/community/namecards/moderation/handlers/approve-namecard";
import { handleFlagNamecard } from "@/domains/community/namecards/moderation/handlers/flag-namecard";
import { handleListAdminNamecards } from "@/domains/community/namecards/moderation/handlers/list-admin-namecards";
import { handleLockNamecard } from "@/domains/community/namecards/moderation/handlers/lock-namecard";
import { handleRejectNamecard } from "@/domains/community/namecards/moderation/handlers/reject-namecard";
import { handleUnlockNamecard } from "@/domains/community/namecards/moderation/handlers/unlock-namecard";
import {
    validateAdminNamecardListQuery,
    validateCompatibleNamecardIdParams,
    validateExpectedRevisionRequest,
    validateRejectedNamecardRequest,
    validateLockedNamecardRequest,
} from "@/domains/community/namecards/request";
import {
    adminNamecardListQuerySchema,
    compatibleNamecardIdParamsSchema,
    expectedNamecardRevisionRequestSchema,
    flaggedNamecardRequestSchema,
    lockedNamecardRequestSchema,
    rejectedNamecardRequestSchema,
} from "@imsweb/contracts/namecards";
import {
    backofficeAuth,
    backofficeCsrf,
    opOnly,
} from "@/middleware/hono-auth";
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator,
} from "@/middleware/request-validation";
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from "@/routing/capability-router";

export function namecardModerationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    const namecardIdValidator = paramSchemaValidator(
        compatibleNamecardIdParamsSchema,
        { invalidMessage: "名片 ID 无效" },
        validateCompatibleNamecardIdParams,
    );
    routes.get(
        "/",
        backofficeAuth,
        opOnly,
        querySchemaValidator(adminNamecardListQuerySchema, { invalidMessage: "名片分页参数无效" }, validateAdminNamecardListQuery),
        handleListAdminNamecards,
    );
    routes.post(
        "/approve/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonSchemaValidator(expectedNamecardRevisionRequestSchema, { invalidMessage: "expected_revision must be a non-negative integer" }, validateExpectedRevisionRequest),
        handleApproveNamecard,
    );
    routes.post(
        "/reject/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonSchemaValidator(rejectedNamecardRequestSchema, { invalidMessage: "expected_revision must be a non-negative integer" }, validateRejectedNamecardRequest),
        handleRejectNamecard,
    );
    // Flagging is a verdict on the submitted revision only; a published card
    // keeps its live copy, a first submission is locked like a rejection.
    routes.post(
        "/flag/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonSchemaValidator(flaggedNamecardRequestSchema, { invalidMessage: "expected_revision must be a non-negative integer and reason is required" }, validateLockedNamecardRequest),
        handleFlagNamecard,
    );
    // Moderation locks a card instead of deleting it: the row and its media stay
    // so a reviewer can revisit the decision, and nothing is lost for the owner.
    routes.post(
        "/lock/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonSchemaValidator(lockedNamecardRequestSchema, { invalidMessage: "expected_revision must be a non-negative integer and reason is required" }, validateLockedNamecardRequest),
        handleLockNamecard,
    );
    routes.post(
        "/unlock/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonSchemaValidator(expectedNamecardRevisionRequestSchema, { invalidMessage: "expected_revision must be a non-negative integer" }, validateExpectedRevisionRequest),
        handleUnlockNamecard,
    );
    return routes;
}
