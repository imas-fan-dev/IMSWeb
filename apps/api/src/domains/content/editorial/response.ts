import type {
    AdminEditorialSpotlightEntry,
    EditorialArticle,
    EditorialArticleAsset,
    EditorialArticleAssetList,
    EditorialArticleList,
    EditorialChroniclePage,
    EditorialDraft,
    EditorialSpotlightItem,
    EditorialSpotlight,
    AdminEditorialSpotlight,
    EditorialLegacyInformation,
    EditorialRevision,
    EditorialStatusChange,
    // pi-lens-ignore: ts:2305
    EditorialMutation,
    // pi-lens-ignore: ts:2305
    EditorialErrorResponse as EditorialContractErrorResponse
} from '@imsweb/contracts/editorial';

export type EditorialArticleResponse = EditorialArticle;
export type EditorialArticleListResponse = EditorialArticleList;
export type EditorialChroniclePageResponse = EditorialChroniclePage;
export type EditorialDraftResponse = EditorialDraft;
export type EditorialArticleAssetResponse = EditorialArticleAsset;
export type EditorialArticleAssetListResponse = EditorialArticleAssetList;
export type EditorialSpotlightResponse = EditorialSpotlight;
export type AdminEditorialSpotlightResponse = AdminEditorialSpotlight;
export type EditorialLegacyInformationResponse = EditorialLegacyInformation;
export type EditorialRevisionResponse = EditorialRevision;
export type EditorialStatusResponse = EditorialStatusChange;
export type EditorialMutationResponse = EditorialMutation;
export type EditorialErrorResponse = EditorialContractErrorResponse;

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

function relatedLinks(value: unknown): EditorialArticleResponse['related_links'] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const link = item as EditorialSourceRow;
        return typeof link.label === 'string' && typeof link.url === 'string'
            ? [{ label: link.label, url: link.url }]
            : [];
    });
}

function articleStatus(value: unknown): EditorialArticleResponse['status'] {
    if (value === 'draft' || value === 'published' || value === 'archived') return value;
    throw new Error('Editorial repository returned an invalid status');
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

function optionalNullableText(value: unknown, field: string): string | null | undefined {
    return value === undefined ? undefined : nullableText(value, field);
}

function optionalTextList(value: unknown, field: string): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new Error(`Editorial repository returned an invalid ${field}`);
    }
    return [...value];
}

/**
 * Repository rows can include storage-only columns. Build the response from an
 * explicit allowlist so every emitted property belongs to the exact contract.
 */
export function toEditorialArticleResponse(
    value: unknown
): EditorialArticleResponse {
    const row = editorialRow(value);
    // pi-lens-ignore: ts:2322
    const response: EditorialArticleResponse = {
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
        status: articleStatus(row.status),
        related_links: relatedLinks(row.related_links),
        revision: counter(row.revision, 'revision')
    };

    if (row.body_json !== undefined) response.body_json = row.body_json;
    const optionalTextFields = [
        'updated_at',
        'name',
        'contact',
        'start_at',
        'end_at',
        'timezone',
        'venue_name',
        'address',
        'registration_url',
        'event_status',
        'source_url',
        'occurred_on',
        'ended_on',
        'location',
        'live_source_id',
        'live_title',
        'live_date',
        'live_time',
        'live_location',
        'live_detail_url'
    ] as const;
    for (const field of optionalTextFields) {
        const fieldValue = optionalNullableText(row[field], field);
        if (fieldValue !== undefined) Object.assign(response, { [field]: fieldValue });
    }

    if (row.kind !== undefined) {
        if (row.kind !== null && row.kind !== 'event' && row.kind !== 'notice') {
            throw new Error('Editorial repository returned an invalid kind');
        }
        response.kind = row.kind;
    }
    if (row.spotlight_category !== undefined) {
        if (
            row.spotlight_category !== null &&
            row.spotlight_category !== 'activity' &&
            row.spotlight_category !== 'fan'
        ) {
            throw new Error('Editorial repository returned an invalid spotlight_category');
        }
        response.spotlight_category = row.spotlight_category;
    }
    if (row.date_precision !== undefined) {
        if (
            row.date_precision !== null &&
            row.date_precision !== 'year' &&
            row.date_precision !== 'month' &&
            row.date_precision !== 'day'
        ) {
            throw new Error('Editorial repository returned an invalid date_precision');
        }
        response.date_precision = row.date_precision;
    }
    if (row.source_type !== undefined) {
        if (
            row.source_type !== null &&
            row.source_type !== 'official' &&
            row.source_type !== 'community'
        ) {
            throw new Error('Editorial repository returned an invalid source_type');
        }
        response.source_type = row.source_type;
    }
    if (row.source_event_id !== undefined) {
        response.source_event_id = row.source_event_id === null
            ? null
            : identifier(row.source_event_id, 'source_event_id');
    }
    if (row.spotlight_order !== undefined) {
        response.spotlight_order = row.spotlight_order === null
            ? null
            : counter(row.spotlight_order, 'spotlight_order');
    }
    if (row.timeline_order !== undefined) {
        response.timeline_order = counter(row.timeline_order, 'timeline_order');
    }
    if (row.live_franchises !== undefined) {
        // pi-lens-ignore: ts:2322
        response.live_franchises = optionalTextList(
            row.live_franchises,
            'live_franchises'
        );
    }
    if (row.live_brand_codes !== undefined) {
        // pi-lens-ignore: ts:2322
        response.live_brand_codes = optionalTextList(
            row.live_brand_codes,
            'live_brand_codes'
        );
    }

    return response;
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
): EditorialSpotlightItem {
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
): AdminEditorialSpotlightEntry {
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
