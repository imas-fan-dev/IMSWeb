import type { AdminPlatformUserDetailResponse } from '@imsweb/contracts/platform/admin-users';
import type { AppEnvironment } from '@/app';
import type { AdminPlatformUserIdParams } from '@imsweb/contracts/platform/admin-users';
import { platformUserNotFound } from '@/domains/admin/platform-users/errors';
import {
    findAdminPlatformUser
} from '@/domains/admin/platform-users/find-platform-user';
import { toAdminPlatformUserDetail } from '@/domains/admin/platform-users/response';
import { platformAccountRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleGetAdminPlatformUser(
    c: ValidatedRequestContext<AppEnvironment, 'param', AdminPlatformUserIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const [record, links] = await Promise.all([
        findAdminPlatformUser(c, id),
        // The link projection already drops `provider_subject`; the detail
        // response only ever reports a session count, never a session row.
        platformAccountRepository(c).listOAuthIdentitiesByAccount(id)
    ]);
    if (!record) return platformUserNotFound(c);
    const payload: AdminPlatformUserDetailResponse = {
        success: true,
        user: toAdminPlatformUserDetail(record, links)
    };
    return c.json(payload);
}
