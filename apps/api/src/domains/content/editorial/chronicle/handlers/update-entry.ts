import type {
    ChronicleDatePrecision,
    ChronicleSourceType
} from '@/ports/repositories';
import {
    articleFields,
    dateValue,
    enumValue,
    revision,
    text
} from '@/domains/content/editorial/contracts/article-input';
import { statusResponse } from '@/domains/content/editorial/contracts/article-view';
import {
    CHRONICLE_DATE_PRECISIONS,
    CHRONICLE_SOURCE_TYPES,
    isString
} from '@/domains/content/editorial/chronicle/request';
import type {
    EditorialArticlePayload,
    EditorialArticleRequestContext
} from '@/domains/content/editorial/request';
import type {
    EditorialErrorResponse,
    EditorialRevisionResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

function precisionOf(
    payload: EditorialArticlePayload,
    current: Record<string, unknown>
): ChronicleDatePrecision | null {
    if (payload.datePrecision === undefined) {
        return current.date_precision as ChronicleDatePrecision | null;
    }
    if (payload.datePrecision === null) return null;
    return enumValue(payload.datePrecision, CHRONICLE_DATE_PRECISIONS, '日期精度');
}

function stringList(value: unknown, current: unknown): string[] {
    if (Array.isArray(value)) return value.filter(isString).slice(0, 50);
    return Array.isArray(current) ? current as string[] : [];
}

export async function handleUpdateChronicleEntry(
    c: EditorialArticleRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const payload = c.req.valid('json');
    const repository = editorialRepository(c);
    const current = await repository.findAdminChronicle(id);
    if (!current) {
        return c.json({ error: '编年史不存在' } satisfies EditorialErrorResponse, 404);
    }
    const precision = precisionOf(payload, current);
    const fields = await articleFields(c, repository, id, payload, current);
    const result = await repository.updateChronicle(id, {
        ...fields,
        occurredOn: dateValue(payload.occurredOn ?? current.occurred_on, precision),
        endedOn: dateValue(payload.endedOn ?? current.ended_on, precision),
        datePrecision: precision,
        sourceType: payload.sourceType === undefined
            ? current.source_type as ChronicleSourceType | null
            : enumValue(payload.sourceType, CHRONICLE_SOURCE_TYPES, '来源类型'),
        sourceEventId: payload.sourceEventId === null || payload.sourceEventId === undefined
            ? (current.source_event_id === null ? null : Number(current.source_event_id))
            : Number(payload.sourceEventId),
        location: text(payload.location ?? current.location, '地点', 500),
        timelineOrder: payload.timelineOrder === undefined
            ? Number(current.timeline_order || 0)
            : revision(payload.timelineOrder),
        liveSourceId: text(payload.liveSourceId ?? current.live_source_id, 'Live来源ID', 160),
        liveTitle: text(payload.liveTitle ?? current.live_title, 'Live标题', 500),
        liveDate: text(payload.liveDate ?? current.live_date, 'Live日期', 80),
        liveTime: text(payload.liveTime ?? current.live_time, 'Live时间', 80),
        liveLocation: text(payload.liveLocation ?? current.live_location, 'Live地点', 500),
        liveDetailUrl: text(payload.liveDetailUrl ?? current.live_detail_url, 'Live详情地址', 1000),
        liveFranchises: stringList(payload.liveFranchises, current.live_franchises),
        liveBrandCodes: stringList(payload.liveBrandCodes, current.live_brand_codes)
    });
    const conflict = statusResponse(result, c);
    if (conflict) return conflict;
    return c.json({ revision: result.revision } satisfies EditorialRevisionResponse);
}
