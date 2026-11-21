import type { Env } from 'hono';
import {
    wikiErrorBody,
    wikiJson,
    writeWikiAudit,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';
import type {
    WikiEntryDocumentParams,
    WikiEntryDocumentSaveRequest,
} from '@/domains/content/wiki/documents/document-request';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type {
    WikiJsonResponse,
    WikiRouteHandler,
} from '@/domains/content/wiki/response';

type SaveInput = WikiValidatedInput<'param', WikiEntryDocumentParams> &
    WikiValidatedInput<'json', WikiEntryDocumentSaveRequest>;

export function createHandleSaveWikiEntryDocument<E extends Env>(
    resolveServices: WikiServicesResolver<E>,
): WikiRouteHandler<E, SaveInput> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story']);
        const { entryId } = context.req.valid('param');
        const { contentMode, sourceMarkdown, expectedRevision, summary } =
            context.req.valid('json');
        const repository = services.story!;
        const entry = await repository.findWikiEntryDocumentTarget(entryId);
        if (!entry) return wikiJson(wikiErrorBody('找不到该内容页'), 404);
        const compiled = await compileEnhancedMarkdown(sourceMarkdown);
        const result = await repository.saveWikiEntryDocument({
            entryId,
            contentMode,
            sourceMarkdown,
            document: compiled.document,
            plainText: compiled.plainText,
            expectedRevision,
            summary: summary ?? '',
            updatedBy: null,
        });
        if (result.status === 'not-found')
            return wikiJson(wikiErrorBody('找不到该内容页'), 404);
        if (result.status === 'conflict') {
            return wikiJson(
                {
                    status: 'error',
                    msg: '文档已被其他管理员修改，请重新读取后再保存',
                    revision: result.revision,
                } satisfies WikiJsonResponse,
                409,
            );
        }
        await writeWikiAudit(
            context,
            services,
            'wiki.document.save',
            `entry:${entryId}`,
        );
        return wikiJson({
            status: 'success',
            contentMode,
            revision: result.revision,
            document: compiled.document,
            warnings: compiled.warnings,
        });
    };
}
