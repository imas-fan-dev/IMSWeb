import { articleFields } from '@/domains/content/editorial/contracts/article-input';
import {
    postDetailFields,
    postKind
} from '@/domains/content/editorial/posts/request';
import type { EditorialArticleRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialArticleResponse,
    type EditorialArticleResponse,
    type EditorialErrorResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

/**
 * 预览不落库：把待保存的字段套在当前行上返回，让编辑端与公开详情页
 * 共用同一份渲染路径。
 */
export async function handlePreviewCommunityPost(
    c: EditorialArticleRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const payload = c.req.valid('json');
    const repository = editorialRepository(c);
    const current = await repository.findAdminEvent(id);
    if (!current) {
        return c.json({ error: '社区帖子不存在' } satisfies EditorialErrorResponse, 404);
    }
    const fields = await articleFields(
        c,
        repository,
        Number(current.article_id),
        payload,
        current
    );
    const kind = postKind(payload.kind, current.kind);
    const details = postDetailFields(payload, current, kind);
    return c.json(toEditorialArticleResponse({
        ...current,
        title: fields.title,
        summary: fields.summary,
        cover_url: fields.coverUrl,
        body_json: fields.bodyJson,
        body_html: fields.bodyHtml,
        cover_focal_x: fields.coverTransform.focalX,
        cover_focal_y: fields.coverTransform.focalY,
        cover_zoom: fields.coverTransform.zoom,
        kind: details.kind,
        source_url: details.sourceUrl,
        name: details.name,
        contact: details.contact,
        start_at: details.startAt,
        end_at: details.endAt,
        timezone: details.timezone,
        venue_name: details.venueName,
        address: details.address,
        registration_url: details.registrationUrl,
        event_status: details.eventStatus,
        related_links: details.relatedLinks
    }) satisfies EditorialArticleResponse);
}
