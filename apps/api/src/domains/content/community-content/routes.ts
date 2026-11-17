import { adminCommunityContentUpdateRequestSchema } from '@imsweb/contracts/community-content';
import { adminApiPath, communityApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleGetAdminCommunityContent } from '@/domains/content/community-content/handlers/get-admin-community-content';
import { handleGetCommunityContent } from '@/domains/content/community-content/handlers/get-community-content';
import { handleUploadCommunityContentImage } from '@/domains/content/community-content/handlers/upload-community-content-image';
import { handleUpdateCommunityContent } from '@/domains/content/community-content/handlers/update-community-content';
import { validateCommunityContentUpdateRequest } from '@/domains/content/community-content/data';
import { backofficeAuth, backofficeCsrf } from '@/middleware/hono-auth';
import { communityContentEditors } from '@/domains/content/community-content/editor-policy';
import { jsonSchemaValidator } from '@/middleware/request-validation';

export function registerCommunityContentRoutes(app: ImsHonoApp): void {
    app.get(communityApiPath('/content'), handleGetCommunityContent);
    app.get(
        adminApiPath('/community-content'),
        backofficeAuth,
        communityContentEditors,
        handleGetAdminCommunityContent,
    );
    app.post(
        adminApiPath('/community-content/images'),
        backofficeAuth,
        communityContentEditors,
        backofficeCsrf,
        handleUploadCommunityContentImage,
    );
    app.put(
        adminApiPath('/community-content'),
        backofficeAuth,
        communityContentEditors,
        backofficeCsrf,
        jsonSchemaValidator(
            adminCommunityContentUpdateRequestSchema,
            {
                malformedMessage: '请求正文必须为 JSON',
            },
            validateCommunityContentUpdateRequest,
        ),
        handleUpdateCommunityContent,
    );
}
