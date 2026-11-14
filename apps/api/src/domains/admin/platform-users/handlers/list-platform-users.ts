import type { AdminPlatformUserList } from '@imsweb/contracts/platform/admin-users';
import type { AppEnvironment } from '@/app';
import type { AdminPlatformUserListQuery } from '@/domains/admin/platform-users/request';
import { toAdminPlatformUser } from '@/domains/admin/platform-users/response';
import { platformAccountRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListAdminPlatformUsers(
    c: ValidatedRequestContext<
        AppEnvironment,
        'query',
        AdminPlatformUserListQuery
    >
): Promise<Response> {
    const query = c.req.valid('query');
    const repository = platformAccountRepository(c);
    const [records, total] = await Promise.all([
        repository.listPlatformAccountsForAdmin({
            field: query.field,
            query: query.query,
            limit: query.pageSize,
            offset: (query.page - 1) * query.pageSize,
            activeAt: Date.now()
        }),
        repository.countPlatformAccountsForAdmin({
            field: query.field,
            query: query.query
        })
    ]);
    const totalPages = Math.ceil(total / query.pageSize);
    const payload: AdminPlatformUserList = {
        success: true,
        users: records.map(toAdminPlatformUser),
        pageInfo: {
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages,
            hasNextPage: query.page < totalPages
        }
    };
    return c.json(payload);
}
