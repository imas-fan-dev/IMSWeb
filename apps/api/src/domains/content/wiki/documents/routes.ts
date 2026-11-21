import { adminWikiPath } from '@imsweb/contracts/paths';
import {
    adminWikiEntryIdParamsSchema,
    adminWikiPreviewEntryDocumentRequestSchema,
    adminWikiSaveEntryDocumentRequestSchema,
} from '@imsweb/contracts/wiki';
import type { Env, Hono } from 'hono';
import type { WikiServicesResolver } from '@/domains/content/wiki/handler-support';
import { createHandleGetWikiEntryDocument } from '@/domains/content/wiki/documents/handlers/get-entry-document';
import { createHandlePreviewWikiEntryDocument } from '@/domains/content/wiki/documents/handlers/preview-entry-document';
import { createHandleSaveWikiEntryDocument } from '@/domains/content/wiki/documents/handlers/save-entry-document';
import { wikiValidationErrorBody } from '@/domains/content/wiki/request';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
} from '@/middleware/request-validation';

const jsonOptions = {
    malformedMessage: '请求内容不是有效 JSON',
    errorBody: wikiValidationErrorBody,
};

export function registerWikiDocumentRoutes<E extends Env>(
    app: Hono<E>,
    resolveServices: WikiServicesResolver<E>,
): void {
    app.get(
        adminWikiPath('/entries/:entryId/document'),
        paramSchemaValidator(
            adminWikiEntryIdParamsSchema,
            { errorBody: wikiValidationErrorBody },
        ),
        createHandleGetWikiEntryDocument(resolveServices),
    );
    app.put(
        adminWikiPath('/entries/:entryId/document'),
        paramSchemaValidator(
            adminWikiEntryIdParamsSchema,
            { errorBody: wikiValidationErrorBody },
        ),
        jsonSchemaValidator(adminWikiSaveEntryDocumentRequestSchema, jsonOptions),
        createHandleSaveWikiEntryDocument(resolveServices),
    );
    app.post(
        adminWikiPath('/entries/:entryId/document/preview'),
        paramSchemaValidator(
            adminWikiEntryIdParamsSchema,
            { errorBody: wikiValidationErrorBody },
        ),
        jsonSchemaValidator(
            adminWikiPreviewEntryDocumentRequestSchema,
            jsonOptions,
        ),
        createHandlePreviewWikiEntryDocument(),
    );
}
