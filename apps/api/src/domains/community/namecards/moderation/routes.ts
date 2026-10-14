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
    adminNamecardListQuerySchema,
    compatibleNamecardIdParamsSchema,
    expectedNamecardRevisionQuerySchema,
    expectedNamecardRevisionRequestSchema,
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
        jsonSchemaValidator(expectedNamecardRevisionRequestSchema, { invalidMessage: "expected_revision must be a non-negative integer" }, validateExpectedRevisionRequest),
        handleRejectNamecard,
    );
    routes.delete(
        "/:id",
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        namecardIdValidator,
        querySchemaValidator(expectedNamecardRevisionQuerySchema, { invalidMessage: "expected_revision must be a non-negative integer" }, validateExpectedRevisionQuery),
        handleDeleteNamecard,
    );
    return routes;
}
