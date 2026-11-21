import type { Env } from 'hono';
import { wikiJson } from '@/domains/content/wiki/handler-support';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';
import type { WikiEntryDocumentPreviewRequest } from '@/domains/content/wiki/documents/document-request';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

/**
 * Compiles submitted source without reading or writing the database, so the
 * workbench can validate a draft before the optimistic save.
 */
export function createHandlePreviewWikiEntryDocument<E extends Env>(): WikiRouteHandler<
    E,
    WikiValidatedInput<'json', WikiEntryDocumentPreviewRequest>
> {
    return async (context) => {
        const { sourceMarkdown } = context.req.valid('json');
        const compiled = await compileEnhancedMarkdown(sourceMarkdown);
        return wikiJson({
            status: 'success',
            document: compiled.document,
            warnings: compiled.warnings,
        });
    };
}
