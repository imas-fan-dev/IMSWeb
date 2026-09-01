import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { parsePlatformOAuthProviderCode } from '@/domains/identity/platform-auth/oauth/request';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { PlatformOAuthProviderValidationError } from '@/ports/oauth';
import type {
    PlatformOAuthProviderCreateInput,
    PlatformOAuthProviderUpdateInput,
} from '@/ports/oauth';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

function oauthClient(c: Context<AppEnvironment>) {
    const client = services(c).platformOAuth;
    if (!client) throw new Error('OAuth service unavailable');
    return client;
}

export async function handleGetAdminPlatformOAuthProviders(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const providers = await oauthClient(c).listProviderSettings();
    c.header('Cache-Control', 'private, no-store');
    return c.json({ success: true, providers });
}

export async function handleCreateAdminPlatformOAuthProvider(
    c: ValidatedRequestContext<AppEnvironment, 'json', PlatformOAuthProviderCreateInput>,
): Promise<Response> {
    const input = c.req.valid('json');
    try {
        const result = await oauthClient(c).createProvider(input);
        if (result.status === 'conflict') {
            return c.json({ success: false, message: 'OAuth provider code 已存在' }, 409);
        }
        await writeAudit(c, '新增 OAuth provider', input.code);
        c.header('Cache-Control', 'private, no-store');
        return c.json({ success: true, provider: result.provider }, 201);
    } catch (error) {
        if (error instanceof PlatformOAuthProviderValidationError) {
            return c.json({ success: false, message: error.message }, 400);
        }
        const status = statusFromError(error);
        return c.json(
            {
                success: false,
                message: status >= 500 ? 'OAuth provider 新增失败' : messageFromError(error),
            },
            status >= 500 ? 500 : 400,
        );
    }
}

export async function handleUpdateAdminPlatformOAuthProvider(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        Omit<PlatformOAuthProviderUpdateInput, 'code'>
    >,
): Promise<Response> {
    const code = parsePlatformOAuthProviderCode(c.req.param('provider'));
    const input = c.req.valid('json');
    try {
        const result = await oauthClient(c).updateProvider({ ...input, code });
        if (result.status === 'not-found') {
            return c.json({ success: false, message: 'OAuth provider 不存在' }, 404);
        }
        if (result.status === 'conflict') {
            return c.json(
                {
                    success: false,
                    code: 'REVISION_CONFLICT',
                    provider: result.provider,
                },
                409,
            );
        }
        await writeAudit(c, '更新 OAuth provider', code);
        c.header('Cache-Control', 'private, no-store');
        return c.json({ success: true, provider: result.provider });
    } catch (error) {
        if (error instanceof PlatformOAuthProviderValidationError) {
            return c.json({ success: false, message: error.message }, 400);
        }
        const status = statusFromError(error);
        return c.json(
            {
                success: false,
                message: status >= 500 ? 'OAuth 配置保存失败' : messageFromError(error),
            },
            status >= 500 ? 500 : 400,
        );
    }
}

export async function handleDeleteAdminPlatformOAuthProvider(
    c: ValidatedRequestContext<AppEnvironment, 'json', { expectedUpdatedAt: number }>,
): Promise<Response> {
    const code = parsePlatformOAuthProviderCode(c.req.param('provider'));
    const { expectedUpdatedAt } = c.req.valid('json');
    try {
        const status = await oauthClient(c).deleteProvider(code, expectedUpdatedAt);
        if (status === 'not-found') {
            return c.json({ success: false, message: 'OAuth provider 不存在' }, 404);
        }
        if (status === 'conflict') {
            return c.json({ success: false, message: '配置版本已变化，请刷新后重试' }, 409);
        }
        if (status === 'in-use') {
            return c.json(
                {
                    success: false,
                    message: '该 provider 已绑定用户或登录流程，不能删除',
                },
                409,
            );
        }
        await writeAudit(c, '删除 OAuth provider', code);
        c.header('Cache-Control', 'private, no-store');
        return c.json({ success: true, deletedCode: code });
    } catch (error) {
        console.error('Failed to delete OAuth provider', error);
        return c.json({ success: false, message: 'OAuth provider 删除失败' }, 500);
    }
}
