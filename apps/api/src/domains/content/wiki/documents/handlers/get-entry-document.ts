import type { Env } from 'hono';
import {
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';
import type { WikiEntryDocumentParams } from '@/domains/content/wiki/documents/document-request';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';
import type { WikiDocumentWarning } from '@imsweb/contracts/wiki';

export function createHandleGetWikiEntryDocument<E extends Env>(
    resolveServices: WikiServicesResolver<E>,
): WikiRouteHandler<E, WikiValidatedInput<'param', WikiEntryDocumentParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story']);
        const { entryId } = context.req.valid('param');
        const repository = services.story!;
        const entry = await repository.findWikiEntryDocumentTarget(entryId);
        if (!entry) return wikiJson(wikiErrorBody('找不到该内容页'), 404);
        const stored = await repository.findWikiEntryDocument(entryId);
        const compiled = stored
            ? { document: stored.document, warnings: [] as WikiDocumentWarning[] }
            : await compileEnhancedMarkdown('');
        return wikiJson({
            status: 'success',
            entry: {
                id: entry.entryId,
                projectId: entry.projectId,
                projectCode: entry.projectCode,
                projectName: entry.projectName,
                name: entry.name,
                folderName: entry.folderName,
                entryKind: entry.entryKind,
            },
            contentMode: entry.contentMode,
            sourceMarkdown: stored?.sourceMarkdown ?? '',
            revision: stored?.revision ?? 0,
            document: compiled.document,
            warnings: compiled.warnings,
        });
    };
}
