import {
    // pi-lens-ignore: ts:2305
    platformAvatarRemovalRequestSchema,
    // pi-lens-ignore: ts:2305
    platformProfileAvatarQuerySchema,
    // pi-lens-ignore: ts:2305
    platformProfileUpdateRequestSchema
} from '@imsweb/contracts/platform';
import { platformApiPath } from '@imsweb/contracts/paths';
import type { Context, Next } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { handleDeletePlatformAvatar } from '@/domains/identity/platform-profile/handlers/delete-avatar';
import { handleGetPlatformProfile } from '@/domains/identity/platform-profile/handlers/get-profile';
import { handleServePlatformAvatar } from '@/domains/identity/platform-profile/handlers/serve-avatar';
import { handleUpdatePlatformProfile } from '@/domains/identity/platform-profile/handlers/update-profile';
import { handleUploadPlatformAvatar } from '@/domains/identity/platform-profile/handlers/upload-avatar';
import {
    parsePlatformAvatarRemoval,
    parsePlatformProfileSubmission
} from '@/domains/identity/platform-profile/profile-input';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';
import {
    platformUploadRateLimit,
    platformWriteRateLimit
} from '@/middleware/platform-mutation-limit';

function avatarRemovalValue(value: { expectedUpdatedAt: number }): number {
    return value.expectedUpdatedAt;
}

function profileValidationErrorBody(message: string) {
    return {
        success: false as const,
        code: 'PLATFORM_PROFILE_INVALID' as const,
        message
    };
}

function avatarRemovalValidationErrorBody() {
    return {
        success: false as const,
        code: 'PLATFORM_AVATAR_REMOVE_INVALID' as const
    };
}

async function privateProfileResponse(
    c: Context<AppEnvironment>,
    next: Next
): Promise<void> {
    await next();
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Authorization, Cookie', { append: true });
}

export function registerPlatformProfileRoutes(app: ImsHonoApp): void {
    app.use(platformApiPath('/me'), privateProfileResponse);
    app.use(platformApiPath('/me/*'), privateProfileResponse);
    app.get(platformApiPath('/me'), platformAuth, handleGetPlatformProfile);
    app.get(
        platformApiPath('/me/avatar'),
        platformAuth,
        querySchemaValidator(platformProfileAvatarQuerySchema),
        handleServePlatformAvatar
    );
    app.on(
        'HEAD',
        platformApiPath('/me/avatar'),
        platformAuth,
        querySchemaValidator(platformProfileAvatarQuerySchema),
        handleServePlatformAvatar
    );
    app.put(
        platformApiPath('/me'),
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformWriteRateLimit,
        jsonSchemaValidator(platformProfileUpdateRequestSchema, {
            malformedMessage: '请求体必须是有效 JSON',
            errorBody: profileValidationErrorBody,
            schemaErrorParser: parsePlatformProfileSubmission
        }),
        handleUpdatePlatformProfile
    );
    app.put(
        platformApiPath('/me/avatar'),
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformUploadRateLimit,
        handleUploadPlatformAvatar
    );
    app.delete(
        platformApiPath('/me/avatar'),
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformWriteRateLimit,
        jsonSchemaValidator(platformAvatarRemovalRequestSchema, {
            malformedMessage: '请求体必须是有效 JSON',
            errorBody: avatarRemovalValidationErrorBody,
            schemaErrorParser: parsePlatformAvatarRemoval
        }, avatarRemovalValue),
        handleDeletePlatformAvatar
    );
}
