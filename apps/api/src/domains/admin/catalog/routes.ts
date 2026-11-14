import {
    adminCatalogBindingRequestSchema,
    adminCatalogStoryTargetRequestSchema,
    adminCatalogGroupKindRequestSchema,
    adminCatalogProfileRequestSchema,
    adminCatalogProfileImageParamsSchema,
    adminCatalogCreateCharacterRequestSchema,
    adminCatalogDefaultProfileRequestSchema,
} from '@imsweb/contracts/catalog';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
} from '@/middleware/request-validation';
import { handleListAdminCatalog } from '@/domains/admin/catalog/handlers/list-catalog';
import { handleSaveAdminCatalogProfile } from '@/domains/admin/catalog/handlers/save-profile';
import { handleSaveAdminCatalogGroupKind } from '@/domains/admin/catalog/handlers/save-group-kind';
import { handleSaveAdminCatalogWikiBinding } from '@/domains/admin/catalog/handlers/save-wiki-binding';
import { handleSaveAdminCatalogProfileImage } from '@/domains/admin/catalog/handlers/save-profile-image';
import { handleServeAdminCatalogProfileImage } from '@/domains/admin/catalog/handlers/serve-profile-image';
import { catalogValidationError } from '@/domains/admin/catalog/request';
import { handleCreateAdminCatalogCharacter } from '@/domains/admin/catalog/handlers/create-character';
import { handleSetAdminCatalogDefaultProfile } from '@/domains/admin/catalog/handlers/set-default-profile';
import { handleEnsureCharacterStoryTarget } from '@/domains/admin/catalog/handlers/ensure-story-target';

const validation = { errorBody: catalogValidationError };

export function registerAdminCatalogRoutes(app: ImsHonoApp): void {
    const base = adminApiPath('/catalog');
    app.get(base, backofficeAuth, handleListAdminCatalog);
    app.post(
        `${base}/story-target`,
        backofficeAuth,
        backofficeCsrf,
        jsonSchemaValidator(adminCatalogStoryTargetRequestSchema, validation),
        handleEnsureCharacterStoryTarget,
    );
    app.post(
        `${base}/characters`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(
            adminCatalogCreateCharacterRequestSchema,
            validation,
        ),
        handleCreateAdminCatalogCharacter,
    );
    app.put(
        `${base}/default-profile`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(
            adminCatalogDefaultProfileRequestSchema,
            validation,
        ),
        handleSetAdminCatalogDefaultProfile,
    );
    app.get(
        `${base}/profile-images/:kind/:id`,
        backofficeAuth,
        paramSchemaValidator(adminCatalogProfileImageParamsSchema, validation),
        handleServeAdminCatalogProfileImage,
    );
    app.put(
        `${base}/profiles`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminCatalogProfileRequestSchema, validation),
        handleSaveAdminCatalogProfile,
    );
    app.put(
        `${base}/group-kind`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminCatalogGroupKindRequestSchema, validation),
        handleSaveAdminCatalogGroupKind,
    );
    app.put(
        `${base}/wiki-bindings`,
        backofficeAuth,
        backofficeCsrf,
        jsonSchemaValidator(adminCatalogBindingRequestSchema, validation),
        handleSaveAdminCatalogWikiBinding,
    );
    app.put(
        `${base}/profile-image`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        handleSaveAdminCatalogProfileImage,
    );
}
