import type { Env } from 'hono';
import {
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import type { WikiEntryDocumentParams } from '@/domains/content/wiki/documents/document-request';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

/**
 * Admin read of one entry's retained document snapshots.
 *
 * The list is newest first and bounded by the repository's retention window, so
 * a maintainer always sees exactly what can still be restored. The document
 * read already carries `revisionsSummary`; this endpoint is the drawer's data.
 */
export function createHandleListWikiEntryDocumentRevisions<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, WikiValidatedInput<'param', WikiEntryDocumentParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story']);
        const { entryId } = context.req.valid('param');
        const repository = services.story!;
        const entry = await repository.findWikiEntryDocumentTarget(entryId);
        if (!entry) return wikiJson(wikiErrorBody('找不到该内容页'), 404);
        return wikiJson({
            status: 'success',
            revisions: await repository.listWikiEntryDocumentRevisions(entryId),
        });
    };
}
