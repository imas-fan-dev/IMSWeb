import { handleApproveNamecard } from "@/domains/community/namecards/moderation/handlers/approve-namecard";
import { handleFlagNamecard } from "@/domains/community/namecards/moderation/handlers/flag-namecard";
import { handleDeleteAdminNamecard } from "@/domains/community/namecards/moderation/handlers/delete-admin-namecard";
import { handleGetAdminNamecardDiff } from "@/domains/community/namecards/moderation/handlers/get-admin-namecard-diff";
import { handleListAdminNamecards } from "@/domains/community/namecards/moderation/handlers/list-admin-namecards";
import { handleListAdminNamecardFeedback } from "@/domains/community/namecards/moderation/handlers/list-admin-feedback";
import { handleLockNamecard } from "@/domains/community/namecards/moderation/handlers/lock-namecard";
import { handleRejectNamecard } from "@/domains/community/namecards/moderation/handlers/reject-namecard";
import { handleServeAdminNamecardMedia } from "@/domains/community/namecards/moderation/handlers/serve-admin-namecard-media";
import { handleResolveAdminNamecardFeedback } from "@/domains/community/namecards/moderation/handlers/resolve-admin-feedback";
import { handleUnlockNamecard } from "@/domains/community/namecards/moderation/handlers/unlock-namecard";
import { handleUpdateAdminNamecard } from "@/domains/community/namecards/moderation/handlers/update-admin-namecard";
import {
    validateAdminNamecardDeleteRequest,
    validateAdminNamecardFeedbackListQuery,
    validateAdminNamecardListQuery,
    validateAdminNamecardUpdateRequest,
    validateCompatibleNamecardIdParams,
    validateExpectedRevisionRequest,
    validateNamecardMediaParams,
    validateRejectedNamecardRequest,
    validateLockedNamecardRequest,
} from "@/domains/community/namecards/request";
import {
    adminNamecardDeleteRequestSchema,
    adminNamecardListQuerySchema,
    adminNamecardUpdateRequestSchema,
    compatibleNamecardIdParamsSchema,
    expectedNamecardRevisionRequestSchema,
    flaggedNamecardRequestSchema,
    lockedNamecardRequestSchema,
    namecardMediaParamsSchema,
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
    adminNamecardFeedbackListQuerySchema,
    namecardFeedbackIdParamsSchema,
    resolveNamecardFeedbackRequestSchema,
} from "@imsweb/contracts/namecards";
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
    // The review queue compares the published copy with the submitted one, so
    // the diff endpoint stays separate from the list payload.
    // The report queue: readers flag a live card, an operator answers it.
    routes.get(
        "/feedback",
        backofficeAuth,
        opOnly,
        querySchemaValidator(adminNamecardFeedbackListQuerySchema, { invalidMessage: "反馈分页参数无效" }, validateAdminNamecardFeedbackListQuery),
        handleListAdminNamecardFeedback,
    );
    routes.post(
        "/feedback/:feedbackId/resolve",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(namecardFeedbackIdParamsSchema, { invalidMessage: "反馈 ID 无效" }),
        jsonSchemaValidator(resolveNamecardFeedbackRequestSchema, { invalidMessage: "处理参数无效" }),
        handleResolveAdminNamecardFeedback,
    );
    routes.get(
        "/:id/diff",
        backofficeAuth,
        opOnly,
        namecardIdValidator,
        handleGetAdminNamecardDiff,
    );
    // The diff dialog compares the live and submitted artwork, which is not
    // public for a first submission.
    routes.get(
        "/:id/media/:variant/:side",
        backofficeAuth,
        opOnly,
        paramSchemaValidator(
            namecardMediaParamsSchema,
            { invalidMessage: "名片 ID 无效" },
            validateNamecardMediaParams,
        ),
        handleServeAdminNamecardMedia,
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
    // The management window rewrites the live card in one request: fields,
    // artwork order, both review columns and the owner. It is the only place
    // that may move a card between accounts.
    routes.put(
        "/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonSchemaValidator(adminNamecardUpdateRequestSchema, { invalidMessage: "card content is invalid" }, validateAdminNamecardUpdateRequest),
        handleUpdateAdminNamecard,
    );
    // Removal stamps `deleted_at`, which every read path already filters, so the
    // card leaves the queue, the wall and the owner's list at once.
    routes.delete(
        "/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        jsonSchemaValidator(adminNamecardDeleteRequestSchema, { invalidMessage: "expected_revision must be a non-negative integer" }, validateAdminNamecardDeleteRequest),
        handleDeleteAdminNamecard,
    );
    return routes;
}
