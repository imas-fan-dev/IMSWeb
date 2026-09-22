import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import { services } from "@/middleware/hono-context";
import type { UploadedFile } from "@/ports/http";
import type { ValidatedRequestInput } from "@/middleware/request-validation";
import {
    canonicalPositiveInteger,
    positiveInteger,
} from "@/utils/validation/number";
import { invalidRequest, requestRecord } from "@/utils/validation/request-data";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_REPLACEMENT_IMAGE_BYTES = 3 * 1024 * 1024 + 128 * 1024;

export interface CompatibleNamecardIdParams {
    id: number;
}

export interface NamecardListQuery {
    page: number;
    size: number;
}

export interface AdminNamecardListQuery {
    page: number;
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

export type NamecardDeleteContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<"param", CompatibleNamecardIdParams> &
        ValidatedRequestInput<"query", ExpectedRevisionQuery>
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

export function validateNamecardListQuery(value: unknown): NamecardListQuery {
    const query = requestRecord(value, "名片分页参数无效");
    return {
        page: legacyPaginationValue(query.page, DEFAULT_PAGE),
        size: legacyPaginationValue(query.size, DEFAULT_PAGE_SIZE),
    };
}

export function validateAdminNamecardListQuery(
    value: unknown,
): AdminNamecardListQuery {
    const query = requestRecord(value, "名片分页参数无效");
    return { page: legacyPaginationValue(query.page, DEFAULT_PAGE) };
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
