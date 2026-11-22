import type { Env } from 'hono';
import {
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';
import {
    collectWikiDocumentAssetSites,
    collectWikiDocumentCategorySites,
    loadWikiDocumentAssetTable,
    resolveWikiDocumentAssets,
    documentAssetUrlResolver,
} from '@/domains/content/wiki/documents/document-assets';
import type { WikiEntryDocumentParams } from '@/domains/content/wiki/documents/document-request';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

/**
 * Admin read of one entry document.
 *
 * The stored AST is re-resolved on every read so the workbench and public pages
 * share one image-URL policy, `media` lists the entry's uploads for the
 * insert-media picker, and `revisionsSummary` reports how much restore-able
 * history exists without paying for the thirty snapshots themselves.
 */
export function createHandleGetWikiEntryDocument<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, WikiValidatedInput<'param', WikiEntryDocumentParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        const { entryId } = context.req.valid('param');
        const repository = services.story!;
        const entry = await repository.findWikiEntryDocumentTarget(entryId);
        if (!entry) return wikiJson(wikiErrorBody('找不到该内容页'), 404);
        const [stored, mediaRecords, revisionsSummary] = await Promise.all([
            repository.findWikiEntryDocument(entryId),
            repository.listWikiEntryDocumentMedia(entryId),
            repository.findWikiEntryDocumentRevisionsSummary(entryId),
        ]);
        const document = stored
            ? stored.document
            : (await compileEnhancedMarkdown('')).document;
        const assetRefs = collectWikiDocumentAssetSites(document);
        const assets = await loadWikiDocumentAssetTable({
            repository,
            entryId,
            projectId: entry.projectId,
            assetRefs,
        });
        const imageUrl = documentAssetUrlResolver(services.storage!);
        const resolved = await resolveWikiDocumentAssets({
            document,
            assetRefs,
            categoryRefs: collectWikiDocumentCategorySites(document),
            assets,
            imageUrl,
        });
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
            document: resolved.document,
            warnings: resolved.warnings,
            media: await Promise.all(
                mediaRecords.map(async (record) => ({
                    id: record.id,
                    imageUrl: await imageUrl(
                        { kind: 'doc', id: record.id },
                        record.objectKey
                    ),
                    altText: record.altText,
                }))
            ),
            revisionsSummary,
        });
    };
}
