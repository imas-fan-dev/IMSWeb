import type {
    AdminEditorialSpotlightEntryInput,
    EditorialArticleAssetInput,
    EditorialArticleInput,
    EditorialArticleListInput,
    EditorialChroniclePageInput,
    EditorialDraftInput,
    EditorialSpotlightItemInput
} from '@imsweb/contracts/editorial';

export type EditorialArticleResponse = EditorialArticleInput;
export type EditorialArticleListResponse = EditorialArticleListInput;
export type EditorialChroniclePageResponse = EditorialChroniclePageInput;
export type EditorialDraftResponse = EditorialDraftInput;
export type EditorialArticleAssetResponse = EditorialArticleAssetInput & {
    format?: string;
};

export interface EditorialArticleAssetListResponse {
    items: EditorialArticleAssetResponse[];
}

export interface EditorialSpotlightResponse {
    items: EditorialSpotlightItemInput[];
}

export interface AdminEditorialSpotlightResponse {
    items: AdminEditorialSpotlightEntryInput[];
}

export interface EditorialLegacyInformationResponse {
    postId: number | null;
}

export interface EditorialRevisionResponse {
    revision: number | undefined;
}

export interface EditorialStatusResponse {
    status: string;
    revision: number | undefined;
}

export interface EditorialMutationResponse {
    success: true;
}

export interface EditorialErrorResponse {
    error: string;
    revision?: number;
}

interface EditorialSourceRow {
    [field: string]: unknown;
}

function editorialRow(value: unknown): EditorialSourceRow {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Editorial repository returned an invalid row');
    }
    return value as EditorialSourceRow;
}

function identifier(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`Editorial repository returned an invalid ${field}`);
    }
    return parsed;
}

function optionalIdentifier(value: unknown, field: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    return identifier(value, field);
}

function nullableText(value: unknown, field: string): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toJSON();
    throw new Error(`Editorial repository returned an invalid ${field}`);
}

function requiredText(value: unknown, field: string): string {
    const text = nullableText(value, field);
    if (text === null) throw new Error(`Editorial repository returned an invalid ${field}`);
    return text;
}

function counter(value: unknown, field: string): number {
    const parsed = Number(value ?? 0);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`Editorial repository returned an invalid ${field}`);
    }
    return parsed;
}

function coverTransform(
    row: EditorialSourceRow
): NonNullable<EditorialArticleResponse['cover_transform']> {
    const focalX = Number(row.cover_focal_x ?? 0.5);
    const focalY = Number(row.cover_focal_y ?? 0.5);
    const zoom = Number(row.cover_zoom ?? 1);
    if (!Number.isFinite(focalX) || !Number.isFinite(focalY) || !Number.isFinite(zoom)) {
        return { focalX: 0.5, focalY: 0.5, zoom: 1 };
    }
    return { focalX, focalY, zoom };
}

/**
 * 仓储按行返回文章，这里把行收敛成契约里的文章形状；未声明的列由
 * passthrough 透传，因此编年史与社区帖子共用一个映射。
 */
export function toEditorialArticleResponse(
    value: unknown
): EditorialArticleResponse {
    const row = editorialRow(value);
    return {
        ...row,
        id: optionalIdentifier(row.id, 'id'),
        article_id: optionalIdentifier(row.article_id, 'article_id'),
        title: requiredText(row.title, 'title'),
        summary: nullableText(row.summary, 'summary') || '',
        cover_url: nullableText(row.cover_url, 'cover_url'),
        cover_transform: coverTransform(row),
        image_url: nullableText(row.image_url, 'image_url'),
        created_at: nullableText(row.created_at, 'created_at'),
        published_at: nullableText(row.published_at, 'published_at'),
        body_html: nullableText(row.body_html, 'body_html') || '',
        revision: counter(row.revision, 'revision')
    };
}

export function toEditorialArticleListResponse(
    rows: readonly unknown[]
): EditorialArticleListResponse {
    return { items: rows.map(toEditorialArticleResponse) };
}

export function toEditorialDraftResponse(value: unknown): EditorialDraftResponse {
    const row = editorialRow(value);
    return {
        id: identifier(row.id, 'id'),
        article_id: identifier(row.article_id, 'article_id'),
        revision: counter(row.revision, 'revision')
    };
}

export function toEditorialArticleAssetResponse(
    value: unknown,
    format?: string
): EditorialArticleAssetResponse {
    const row = editorialRow(value);
    return {
        id: identifier(row.id, 'id'),
        article_id: identifier(row.article_id, 'article_id'),
        public_path: requiredText(row.public_path, 'public_path'),
        asset_usage: row.asset_usage === 'cover' ? 'cover' : 'body',
        alt_text: nullableText(row.alt_text, 'alt_text') || '',
        ...(format ? { format } : {})
    };
}

export function toEditorialArticleAssetListResponse(
    rows: readonly unknown[]
): EditorialArticleAssetListResponse {
    return { items: rows.map((row) => toEditorialArticleAssetResponse(row)) };
}

export function toEditorialSpotlightItemResponse(
    value: unknown
): EditorialSpotlightItemInput {
    const row = editorialRow(value);
    return {
        id: identifier(row.id, 'id'),
        title: requiredText(row.title, 'title'),
        image_url: nullableText(row.image_url, 'image_url'),
        category: row.category === 'fan' ? 'fan' : 'activity',
        sort_order: counter(row.sort_order, 'sort_order'),
        cover_transform: coverTransform(row)
    };
}

export function toAdminEditorialSpotlightEntryResponse(
    value: unknown
): AdminEditorialSpotlightEntryInput {
    const row = editorialRow(value);
    const status = requiredText(row.status, 'status');
    if (status !== 'draft' && status !== 'published' && status !== 'archived') {
        throw new Error('Editorial repository returned an invalid status');
    }
    return {
        post_id: identifier(row.post_id, 'post_id'),
        category: row.category === 'fan' ? 'fan' : 'activity',
        sort_order: counter(row.sort_order, 'sort_order'),
        title: requiredText(row.title, 'title'),
        status,
        image_url: nullableText(row.image_url, 'image_url'),
        kind: row.kind === 'notice' ? 'notice' : 'event',
        cover_transform: coverTransform(row)
    };
}
