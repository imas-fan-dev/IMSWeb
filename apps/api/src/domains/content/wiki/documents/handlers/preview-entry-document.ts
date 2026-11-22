import type { Env } from 'hono';
import {
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';
import {
    loadWikiDocumentAssetTable,
    resolveWikiDocumentAssets,
    documentAssetUrlResolver,
} from '@/domains/content/wiki/documents/document-assets';
import type {
    WikiEntryDocumentParams,
    WikiEntryDocumentPreviewRequest,
} from '@/domains/content/wiki/documents/document-request';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

type PreviewInput = WikiValidatedInput<'param', WikiEntryDocumentParams> &
    WikiValidatedInput<'json', WikiEntryDocumentPreviewRequest>;

/**
 * Compiles submitted source without writing the database.
 *
 * Reading the entry target is read-only but required: image and category
 * references are verified against the entry's project, entry, and card pool, so
 * the workbench sees the same diagnostics the save would produce.
 */
export function createHandlePreviewWikiEntryDocument<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, PreviewInput> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        const { entryId } = context.req.valid('param');
        const { sourceMarkdown } = context.req.valid('json');
        const repository = services.story!;
        const entry = await repository.findWikiEntryDocumentTarget(entryId);
        if (!entry) return wikiJson(wikiErrorBody('找不到该内容页'), 404);
        const compiled = await compileEnhancedMarkdown(sourceMarkdown);
        const [assets, imageUrl] = await Promise.all([
            loadWikiDocumentAssetTable({
                repository,
                entryId,
                projectId: entry.projectId,
                assetRefs: compiled.assetRefs,
            }),
            documentAssetUrlResolver(services.storage!, entry.projectName, entry.name),
        ]);
        const resolved = await resolveWikiDocumentAssets({
            document: compiled.document,
            assetRefs: compiled.assetRefs,
            categoryRefs: compiled.categoryRefs,
            assets,
            imageUrl,
        });
        return wikiJson({
            status: 'success',
            document: resolved.document,
            warnings: [...compiled.warnings, ...resolved.warnings],
        });
    };
}
