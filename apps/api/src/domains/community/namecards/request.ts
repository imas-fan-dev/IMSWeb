import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import { services } from "@/middleware/hono-context";
import type { UploadedFile } from "@/ports/http";
import type { ValidatedRequestInput } from "@/middleware/request-validation";
import type {
    AdminNamecardDeleteRequest,
    AdminNamecardUpdateRequest,
    NamecardCollectionDirection,
    NamecardWallSort,
} from "@imsweb/contracts/namecards";
import type {
    NamecardFeedbackIdParams,
    ResolveNamecardFeedbackRequest,
} from "@imsweb/contracts/namecards";
import {
    boundedPositiveInteger,
    canonicalPositiveInteger,
    positiveInteger,
} from "@/utils/validation/number";
import { invalidRequest, requestRecord } from "@/utils/validation/request-data";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
/** 每页条数上限：与名片册一致，避免一次拉取/排序过大的页。 */
const MAX_PAGE_SIZE = 100;
const MAX_REPLACEMENT_IMAGE_BYTES = 3 * 1024 * 1024 + 128 * 1024;

export interface CompatibleNamecardIdParams {
    id: number;
}

export interface NamecardListQuery {
    page: number;
    size: number;
    /** 墙上没有交换时间：`created` 用名片创建时间。 */
    sort: NamecardWallSort;
    dir: NamecardCollectionDirection;
    q: string | null;
    series: string[];
    group: string | null;
    character: number[];
    match: "any" | "all";
    excludeOther: boolean;
    excludeCross: boolean;
    declaration: "original" | "ai" | null;
    invert: boolean;
}

export interface NamecardContributorsQuery {
    page: number;
    limit: number;
}

export function validateNamecardContributorsQuery(
    value: unknown,
): NamecardContributorsQuery {
    const query = requestRecord(value, '贡献榜分页参数无效');
    const page = query.page === undefined ? 1 : canonicalPositiveInteger(query.page);
    const limit = query.limit === undefined ? 25 : boundedPositiveInteger(query.limit, 100);
    if (page === null || limit === null) {
        throw invalidRequest('贡献榜分页参数无效');
    }
    return { page, limit };
}

export type AdminNamecardListStatus =
    | "pending"
    | "published"
    | "rejected"
    | "locked"
    | "hidden";

export interface AdminNamecardListQuery {
    page: number;
    query: string | null;
    status: AdminNamecardListStatus | null;
    origins: string[];
    /** 归属账号：只保留该账号名下的名片；`null` 表示不按归属过滤。 */
    ownerAccountId: string | null;
}

export interface ExpectedRevisionRequest {
    expected_revision: number;
}

export interface ExpectedRevisionQuery {
    expected_revision: number | null;
}

export interface NamecardImageSideParams {
    id: number;
    side: "front" | "back";
}

export type NamecardMutationContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<"param", CompatibleNamecardIdParams> &
        ValidatedRequestInput<"json", ExpectedRevisionRequest>
>;

export interface LockedNamecardRequest extends ExpectedRevisionRequest {
    reason: string;
}

export type NamecardLockContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<"param", CompatibleNamecardIdParams> &
        ValidatedRequestInput<"json", LockedNamecardRequest>
>;

/**
 * The management window submits the whole card, so the context carries the
 * parsed contract instead of a hand-rolled projection.
 */
export type NamecardUpdateContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<"param", CompatibleNamecardIdParams> &
        ValidatedRequestInput<"json", AdminNamecardUpdateRequest>
>;

export type NamecardDeleteContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<"param", CompatibleNamecardIdParams> &
        ValidatedRequestInput<"json", AdminNamecardDeleteRequest>
>;

export type NamecardFeedbackResolveContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<"param", NamecardFeedbackIdParams> &
        ValidatedRequestInput<"json", ResolveNamecardFeedbackRequest>
>;

export type NamecardImageReplaceContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<"param", NamecardImageSideParams> &
        ValidatedRequestInput<"query", ExpectedRevisionQuery>
>;

function legacyPaginationValue(value: unknown, fallback: number): number {
    return Number.parseInt((value || "") as string, 10) || fallback;
}

export interface NamecardMediaParams extends CompatibleNamecardIdParams {
    side: string;
    /** `draft` asks for the submitted revision; the live copy is the default. */
    variant: 'live' | 'draft';
}

/** Artwork page handles: front, back, or `middle-<index>`. */
export function validateNamecardMediaParams(
    value: unknown,
): NamecardMediaParams {
    const params = requestRecord(value, "名片 ID 无效");
    const side = typeof params.side === "string" ? params.side : "";
    // 统一布局的页面用稳定槽位 `page-<uuid>`；旧值继续兼容。
    if (
        side !== "front" &&
        side !== "back" &&
        !/^middle-\d{1,2}$/.test(side) &&
        !/^page-[0-9a-f-]{8,}$/.test(side)
    ) {
        throw invalidRequest("名片图页无效");
    }
    return {
        id: positiveInteger(params.id) || 0,
        side,
        variant: params.variant === "draft" ? "draft" : "live",
    };
}

export function validateCompatibleNamecardIdParams(
    value: unknown,
): CompatibleNamecardIdParams {
    const params = requestRecord(value, "名片 ID 无效");
    return { id: positiveInteger(params.id) || 0 };
}

export function validateNamecardImageSideParams(
    value: unknown,
): NamecardImageSideParams {
    const params = requestRecord(value, "名片 ID 无效");
    const id = canonicalPositiveInteger(params.id);
    if (!id) invalidRequest("名片 ID 无效");
    if (params.side !== "front" && params.side !== "back") {
        invalidRequest("名片面无效");
    }
    return { id, side: params.side as "front" | "back" };
}

/** 墙的文本筛选：空串与缺省都读成 null；与契约一样截断到 64 字符。 */
function wallQueryText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim().slice(0, 64);
    return text === "" ? null : text;
}

/** 可重复的文本参数：契约给数组，旧入口给单个字符串。 */
function wallQueryTextList(value: unknown): string[] {
    const values = Array.isArray(value)
        ? value
        : value === undefined
          ? []
          : [value];
    return [
        ...new Set(
            values
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
        )
    ];
}

/** 担当角色 id：契约解析成数字数组，旧入口给字符串。 */
function wallQueryCharacterIds(value: unknown): number[] {
    const values = Array.isArray(value)
        ? value
        : value === undefined
          ? []
          : [value];
    const ids = values.flatMap((item) => {
        if (typeof item === "number") {
            return Number.isSafeInteger(item) && item > 0 ? [item] : [];
        }
        if (typeof item === "string" && /^[1-9]\d{0,17}$/.test(item.trim())) {
            return [Number(item.trim())];
        }
        return [];
    });
    return [...new Set(ids)];
}

export function validateNamecardListQuery(value: unknown): NamecardListQuery {
    const query = requestRecord(value, "名片分页参数无效");
    const isSwitch = (item: unknown) =>
        item === true || item === "true" || item === "1";
    const sort: NamecardWallSort =
        query.sort === "name" || query.sort === "series" || query.sort === "date"
            ? query.sort
            : "created";
    // 缺省方向与名片册同一规则：创建时间与制作日期倒序，其余正序。
    const dir: NamecardCollectionDirection =
        query.dir === "asc" || query.dir === "desc"
            ? query.dir
            : sort === "created" || sort === "date"
              ? "desc"
              : "asc";
    return {
        // 旧入口的数字别名继续按 parseInt 兼容，但不允许 0 / 负数落到分页切片。
        page: Math.max(DEFAULT_PAGE, legacyPaginationValue(query.page, DEFAULT_PAGE)),
        size: Math.min(
            MAX_PAGE_SIZE,
            Math.max(1, legacyPaginationValue(query.size, DEFAULT_PAGE_SIZE))
        ),
        sort,
        dir,
        q: wallQueryText(query.q),
        series: wallQueryTextList(query.series),
        group: wallQueryText(query.group),
        character: wallQueryCharacterIds(query.character),
        match: query.match === "all" ? "all" : "any",
        excludeOther: isSwitch(query.excludeOther),
        excludeCross: isSwitch(query.excludeCross),
        declaration:
            query.declaration === "original" || query.declaration === "ai"
                ? query.declaration
                : null,
        invert: isSwitch(query.invert),
    };
}

/** 主页列表路由只校验了路径参数，分页从这里按线上同一套规则取。 */
export function parseNamecardPage(url: string): NamecardListQuery {
    try {
        const params = new URL(`http://local${url}`).searchParams;
        return validateNamecardListQuery({
            page: params.get('page'),
            size: params.get('size'),
        });
    } catch {
        throw invalidRequest('名片分页参数无效');
    }
}

export type AdminNamecardFeedbackListQuery = {
    page: number;
};

export function validateAdminNamecardListQuery(
    value: unknown,
): AdminNamecardListQuery {
    const query = requestRecord(value, "名片分页参数无效");
    const keyword = typeof query.query === "string" ? query.query.trim() : "";
    const status = typeof query.status === "string" ? query.status.trim() : "";
    const origins = typeof query.origin === "string"
        ? query.origin.split(",").map((value) => value.trim()).filter(Boolean)
        : [];
    const owner = typeof query.owner === "string" ? query.owner.trim() : "";
    return {
        page: legacyPaginationValue(query.page, DEFAULT_PAGE),
        query: keyword === "" ? null : keyword,
        status:
            status === "pending" ||
            status === "published" ||
            status === "rejected" ||
            status === "locked" ||
            status === "hidden"
                ? status
                : null,
        origins: origins.slice(0, 4),
        ownerAccountId: owner === "" ? null : owner,
    };
}

/** Trims the optional reason and rejects a duplicated artwork token. */
export function validateAdminNamecardUpdateRequest(
    value: unknown,
): AdminNamecardUpdateRequest {
    const request = validateExpectedRevisionRequest(value);
    const body = requestRecord(value, "名片内容无效");
    const mediaOrder = Array.isArray(body.media_order) ? body.media_order : [];
    if (new Set(mediaOrder).size !== mediaOrder.length) {
        invalidRequest("名片图片顺序无效");
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    return {
        // SAFETY: the route's contracts schema validates the full update body before this adapter.
        ...(body as unknown as AdminNamecardUpdateRequest),
        ...request,
        reason: reason === "" ? null : reason.slice(0, LOCKED_NAMECARD_REASON_MAX_LENGTH),
    };
}

export function validateAdminNamecardDeleteRequest(
    value: unknown,
): AdminNamecardDeleteRequest {
    return validateExpectedRevisionRequest(value);
}

export const LOCKED_NAMECARD_REASON_MAX_LENGTH = 400;

export function validateLockedNamecardRequest(
    value: unknown,
): LockedNamecardRequest {
    const request = validateExpectedRevisionRequest(value);
    const body = requestRecord(value, "锁定理由无效");
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason === "") invalidRequest("锁定理由不能为空");
    return {
        ...request,
        reason: reason.slice(0, LOCKED_NAMECARD_REASON_MAX_LENGTH),
    };
}

export function validateRejectedNamecardRequest(
    value: unknown,
): ExpectedRevisionRequest & { reason?: string } {
    const request = validateExpectedRevisionRequest(value);
    const body = requestRecord(value, 'expected_revision is required');
    const reason =
        typeof body.reason === 'string' ? body.reason.trim() : '';
    return reason === ''
        ? request
        : { ...request, reason: reason.slice(0, LOCKED_NAMECARD_REASON_MAX_LENGTH) };
}

export function validateExpectedRevisionRequest(
    value: unknown,
): ExpectedRevisionRequest {
    const body = requestRecord(value, "expected_revision is required");
    const revision = Number(body.expected_revision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        invalidRequest("expected_revision must be a non-negative integer");
    }
    return { expected_revision: revision };
}

export function validateExpectedRevisionQuery(
    value: unknown,
): ExpectedRevisionQuery {
    const query = requestRecord(value, "expected_revision is required");
    if (query.expected_revision === undefined) {
        return { expected_revision: null };
    }
    const revision =
        typeof query.expected_revision === "string" &&
        /^\d+$/.test(query.expected_revision)
            ? Number(query.expected_revision)
            : Number.NaN;
    if (!Number.isSafeInteger(revision)) {
        invalidRequest("expected_revision must be a non-negative integer");
    }
    return { expected_revision: revision };
}

function uploadedFiles(
    value: UploadedFile | UploadedFile[] | undefined,
): UploadedFile[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

export async function parseNamecardReplacementImage(
    c: Context<AppEnvironment>,
): Promise<{ image: UploadedFile | null }> {
    const uploads = services(c).uploads;
    if (!uploads) throw new Error("Upload parser unavailable");
    const parsed = await uploads.parse(c.req.raw, {
        maxBytes: MAX_REPLACEMENT_IMAGE_BYTES,
        fileFields: ["image"],
        maxFiles: 1,
        maxFields: 2,
        maxParts: 2,
    });
    const files = uploadedFiles(parsed.files.image);
    return { image: files[0] ?? null };
}

/** The report queue only needs a page number. */
export interface AdminNamecardLockAuditQuery {
    page: number;
    owner: string | null;
    reason: string | null;
    handler: string | null;
    action: 'locked' | 'unlocked' | null;
}

export interface AdminNamecardFeedbackAuditQuery {
    page: number;
    owner: string | null;
    reporter: string | null;
    outcome: 'accepted' | 'rejected' | null;
    handler: string | null;
}

function auditAction(
    query: Record<string, unknown>,
    key: string
): 'locked' | 'unlocked' | null {
    const value = auditText(query, key);
    return value === 'locked' || value === 'unlocked' ? value : null;
}

function auditText(query: Record<string, unknown>, key: string): string | null {
    const value = query[key];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

export function validateAdminNamecardLockAuditQuery(
    value: unknown
): AdminNamecardLockAuditQuery {
    const query = requestRecord(value, '名片审计分页参数无效');
    return {
        page: legacyPaginationValue(query.page, DEFAULT_PAGE),
        owner: auditText(query, 'owner'),
        reason: auditText(query, 'reason'),
        handler: auditText(query, 'handler'),
        action: auditAction(query, 'action')
    };
}

export function validateAdminNamecardFeedbackAuditQuery(
    value: unknown
): AdminNamecardFeedbackAuditQuery {
    const query = requestRecord(value, '名片审计分页参数无效');
    const outcome = auditText(query, 'outcome');
    return {
        page: legacyPaginationValue(query.page, DEFAULT_PAGE),
        owner: auditText(query, 'owner'),
        reporter: auditText(query, 'reporter'),
        outcome: outcome === 'accepted' || outcome === 'rejected' ? outcome : null,
        handler: auditText(query, 'handler')
    };
}

export function validateAdminNamecardFeedbackListQuery(
    value: unknown
): AdminNamecardFeedbackListQuery {
    const query = requestRecord(value, "反馈分页参数无效");
    return { page: legacyPaginationValue(query.page, DEFAULT_PAGE) };
}
