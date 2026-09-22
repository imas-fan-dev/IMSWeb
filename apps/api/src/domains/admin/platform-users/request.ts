import type { Context } from 'hono';
import type {
    AdminPlatformUserIdParams,
    AdminPlatformUserListQuery as AdminPlatformUserListQueryWire,
    AdminPlatformUserStatusRequest
} from '@imsweb/contracts/platform/admin-users';
import type { AppEnvironment } from '@/app';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import type { PlatformAccountAdminSearchField } from '@/ports/repositories';

export const ADMIN_PLATFORM_USER_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_PLATFORM_USER_MAX_PAGE_SIZE = 50;

export interface AdminPlatformUserListQuery {
    field: PlatformAccountAdminSearchField;
    /** `null` means "every account", not "match the empty string". */
    query: string | null;
    page: number;
    pageSize: number;
}

function positiveInteger(value: string | undefined): number | null {
    if (value === undefined) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * `%`, `_` and `\` are LIKE metacharacters. The repository appends
 * `ESCAPE '\'`, so every literal occurrence has to be escaped here before the
 * term becomes a parameter.
 */
export function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Query values arrive as strings; the contract only checks their shape, so
 * parsing, clamping, field defaulting and the email case fold all happen here.
 */
export function normalizeAdminPlatformUserListQuery(
    value: AdminPlatformUserListQueryWire
): AdminPlatformUserListQuery {
    const field: PlatformAccountAdminSearchField = value.field ?? 'display_name';
    let query: string | null = null;
    if (value.query !== undefined) {
        if (field === 'email') {
            query = value.query.toLowerCase();
        } else if (field === 'display_name') {
            // The repository hands the term to `ILIKE ... ESCAPE '\'` as-is, so
            // the domain escapes the literals and adds the substring wildcards.
            query = `%${escapeLikePattern(value.query)}%`;
        } else {
            query = value.query;
        }
    }
    const page = positiveInteger(value.page) ?? 1;
    const requestedPageSize =
        positiveInteger(value.pageSize) ?? ADMIN_PLATFORM_USER_DEFAULT_PAGE_SIZE;
    return {
        field,
        query,
        page,
        pageSize: Math.min(requestedPageSize, ADMIN_PLATFORM_USER_MAX_PAGE_SIZE)
    };
}

export type AdminPlatformUserStatusRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', AdminPlatformUserIdParams> &
        ValidatedRequestInput<'json', AdminPlatformUserStatusRequest>
>;
