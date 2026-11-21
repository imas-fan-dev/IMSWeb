import type { Env } from 'hono';
import {
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import type { WikiEntryDocumentRevisionParams } from '@/domains/content/wiki/documents/document-request';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

/**
 * Admin read of one historical document snapshot, including its Markdown.
 *
 * A revision that never existed, was pruned by the retention window, belongs to
 * another entry, or belongs to a soft-deleted entry all answer the same `404`:
 * the repository scopes the lookup by entry, so the route cannot become an
 * existence oracle for another entry's history.
 */
export function createHandleGetWikiEntryDocumentRevision<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<
    E,
    WikiValidatedInput<'param', WikiEntryDocumentRevisionParams>
> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story']);
        const { entryId, revision } = context.req.valid('param');
        const snapshot = await services.story!.findWikiEntryDocumentRevision(
            entryId,
            revision
        );
        if (!snapshot) return wikiJson(wikiErrorBody('找不到该文档版本'), 404);
        return wikiJson({
            status: 'success',
            revision: snapshot.revision,
            summary: snapshot.summary,
            createdBy: snapshot.createdBy,
            createdAt: snapshot.createdAt,
            sourceMarkdown: snapshot.sourceMarkdown,
        });
    };
}
