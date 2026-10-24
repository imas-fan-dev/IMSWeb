import type {
    AdminPlatformEmailConfigurationTestRequest,
    AdminPlatformEmailConfigurationWriteRequest,
    AdminPlatformEmailMutationResponse,
    AdminPlatformEmailSettingsResponse,
    AdminPlatformEmailTestResponse,
} from '@imsweb/contracts/platform/admin-email';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { services } from '@/middleware/hono-context';
import {
    PlatformEmailConfigurationValidationError,
    PlatformEmailDeliveryError,
} from '@/ports/email';

function emailConfiguration(c: Context<AppEnvironment>) {
    const configuration = services(c).platformEmailConfiguration;
    if (!configuration) throw new Error('Platform email configuration is unavailable');
    return configuration;
}

function conflictResponse(
    c: Context<AppEnvironment>,
    settings: Awaited<ReturnType<ReturnType<typeof emailConfiguration>['getSettings']>>,
): Response {
    c.header('Cache-Control', 'private, no-store');
    return c.json(
        {
            success: false,
            code: 'REVISION_CONFLICT',
            settings,
        },
        409,
    );
}

function errorResponse(c: Context<AppEnvironment>, error: unknown): Response {
    if (error instanceof PlatformEmailConfigurationValidationError) {
        return c.json({ success: false, message: error.message }, 400);
    }
    if (error instanceof PlatformEmailDeliveryError) {
        return c.json(
            { success: false, message: 'SMTP 连接或发送失败，请检查配置' },
            502,
        );
    }
    return c.json({ success: false, message: '邮件服务配置失败' }, 500);
}

export async function handleGetAdminPlatformEmailSettings(
    c: Context<AppEnvironment>,
): Promise<Response> {
    try {
        const settings = await emailConfiguration(c).getSettings();
        c.header('Cache-Control', 'private, no-store');
        return c.json({ success: true, settings } satisfies AdminPlatformEmailSettingsResponse);
    } catch (error) {
        return errorResponse(c, error);
    }
}

export async function handleUpdateAdminPlatformEmailSettings(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        AdminPlatformEmailConfigurationWriteRequest
    >,
): Promise<Response> {
    const input = c.req.valid('json');
    try {
        const result = await emailConfiguration(c).updateSettings(input);
        if (result.status === 'conflict') return conflictResponse(c, result.settings);
        await writeAudit(c, '更新 SMTP 邮件配置', input.host);
        c.header('Cache-Control', 'private, no-store');
        return c.json({
            success: true,
            settings: result.settings,
        } satisfies AdminPlatformEmailMutationResponse);
    } catch (error) {
        return errorResponse(c, error);
    }
}

export async function handleTestAdminPlatformEmailSettings(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        AdminPlatformEmailConfigurationTestRequest
    >,
): Promise<Response> {
    const input = c.req.valid('json');
    try {
        const result = await emailConfiguration(c).sendTest(input);
        if (result.status === 'conflict') return conflictResponse(c, result.settings);
        await writeAudit(c, '测试 SMTP 邮件配置', result.recipient);
        c.header('Cache-Control', 'private, no-store');
        return c.json({
            success: true,
            deliveredTo: result.recipient,
        } satisfies AdminPlatformEmailTestResponse);
    } catch (error) {
        return errorResponse(c, error);
    }
}
