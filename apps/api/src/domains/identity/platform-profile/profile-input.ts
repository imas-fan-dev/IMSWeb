interface PlatformProfileSubmission {
    bio: string;
    displayName: string;
    expectedUpdatedAt: number;
    homeCity: string | null;
    pageSlug?: string | null;
}

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

/** 主页地址与 uid 共用 /user/<handle>，所以纯数字永远不能作为 slug。 */
const PAGE_SLUG = /^[a-z0-9][a-z0-9_-]{2,31}$/u;

function pageSlug(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') throw badRequest('pageSlug 必须是字符串');
    const normalized = value.trim();
    if (!PAGE_SLUG.test(normalized)) {
        throw badRequest('只能使用小写字母、数字、下划线与连字符，3-32 位');
    }
    if (/^[0-9]+$/u.test(normalized)) {
        throw badRequest('主页地址不能是纯数字');
    }
    return normalized;
}

function text(value: unknown, field: string, maximum: number, required = false): string {
    if (typeof value !== 'string') throw badRequest(`${field} 必须是字符串`);
    const normalized = value.trim();
    if ((required && !normalized) || normalized.length > maximum) {
        throw badRequest(`${field} 长度无效`);
    }
    return normalized;
}

export function parsePlatformProfileSubmission(
    value: unknown
): PlatformProfileSubmission {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('请求体必须是对象');
    }
    const body = value as Record<string, unknown>;
    const allowed = new Set([
        'displayName',
        'homeCity',
        'bio',
        'expectedUpdatedAt',
        'pageSlug'
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
        throw badRequest('请求体包含未知字段');
    }
    if (!Number.isSafeInteger(body.expectedUpdatedAt) || Number(body.expectedUpdatedAt) < 0) {
        throw badRequest('expectedUpdatedAt 必须是非负整数');
    }
    const homeCity = body.homeCity === null
        ? null
        : text(body.homeCity, 'homeCity', 100) || null;
    return {
        displayName: text(body.displayName, 'displayName', 80, true),
        homeCity,
        bio: text(body.bio, 'bio', 2000),
        expectedUpdatedAt: Number(body.expectedUpdatedAt),
        ...(body.pageSlug === undefined ? {} : { pageSlug: pageSlug(body.pageSlug) })
    };
}

// Avatar removal carries the same optimistic fence as every other profile
// write, so a stale tab cannot erase an avatar the owner just replaced.
export function parsePlatformAvatarRemoval(value: unknown): number {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('请求体必须是对象');
    }
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== 'expectedUpdatedAt')) {
        throw badRequest('请求体包含未知字段');
    }
    if (!Number.isSafeInteger(body.expectedUpdatedAt) ||
        Number(body.expectedUpdatedAt) < 0) {
        throw badRequest('expectedUpdatedAt 必须是非负整数');
    }
    return Number(body.expectedUpdatedAt);
}

export function parseExpectedProfileTimestamp(value: string | undefined): number {
    const expected = Number(value);
    if (!Number.isSafeInteger(expected) || expected < 0) {
        throw badRequest('expectedUpdatedAt 必须是非负整数');
    }
    return expected;
}
