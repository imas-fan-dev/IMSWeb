import {
    adminWikiEntryDocumentExportStructuredPath,
    adminWikiEntryDocumentMediaPath,
    adminWikiEntryDocumentPath,
    adminWikiEntryDocumentPreviewPath,
} from '@imsweb/contracts/paths';
import {
    adminWikiEntryIdParamsSchema,
    adminWikiExportStructuredEntryDocumentRequestSchema,
    adminWikiPreviewEntryDocumentRequestSchema,
    adminWikiSaveEntryDocumentRequestSchema,
} from '@imsweb/contracts/wiki';
import type { Env, Hono } from 'hono';
import type { WikiServicesResolver } from '@/domains/content/wiki/handler-support';
import { createHandleExportStructuredWikiEntryDocument } from '@/domains/content/wiki/documents/handlers/export-structured-entry-document';
import { createHandleGetWikiEntryDocument } from '@/domains/content/wiki/documents/handlers/get-entry-document';
import { createHandlePreviewWikiEntryDocument } from '@/domains/content/wiki/documents/handlers/preview-entry-document';
import { createHandleSaveWikiEntryDocument } from '@/domains/content/wiki/documents/handlers/save-entry-document';
import { createHandleUploadWikiEntryDocumentMedia } from '@/domains/content/wiki/documents/handlers/upload-entry-document-media';
import { wikiValidationErrorBody } from '@/domains/content/wiki/request';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
} from '@/middleware/request-validation';

const jsonOptions = {
    malformedMessage: '请求内容不是有效 JSON',
    errorBody: wikiValidationErrorBody,
};
const paramOptions = { errorBody: wikiValidationErrorBody };

export function registerWikiDocumentRoutes<E extends Env>(
    app: Hono<E>,
    resolveServices: WikiServicesResolver<E>,
): void {
    app.get(
        adminWikiEntryDocumentPath(':entryId'),
        paramSchemaValidator(adminWikiEntryIdParamsSchema, paramOptions),
        createHandleGetWikiEntryDocument(resolveServices),
    );
    app.put(
        adminWikiEntryDocumentPath(':entryId'),
        paramSchemaValidator(adminWikiEntryIdParamsSchema, paramOptions),
        jsonSchemaValidator(adminWikiSaveEntryDocumentRequestSchema, jsonOptions),
        createHandleSaveWikiEntryDocument(resolveServices),
    );
    app.post(
        adminWikiEntryDocumentPreviewPath(':entryId'),
        paramSchemaValidator(adminWikiEntryIdParamsSchema, paramOptions),
        jsonSchemaValidator(
            adminWikiPreviewEntryDocumentRequestSchema,
            jsonOptions,
        ),
        createHandlePreviewWikiEntryDocument(resolveServices),
    );
    app.post(
        adminWikiEntryDocumentMediaPath(':entryId'),
        paramSchemaValidator(adminWikiEntryIdParamsSchema, paramOptions),
        createHandleUploadWikiEntryDocumentMedia(resolveServices),
    );
    app.post(
        adminWikiEntryDocumentExportStructuredPath(':entryId'),
        paramSchemaValidator(adminWikiEntryIdParamsSchema, paramOptions),
        jsonSchemaValidator(
            adminWikiExportStructuredEntryDocumentRequestSchema,
            jsonOptions,
        ),
        createHandleExportStructuredWikiEntryDocument(resolveServices),
    );
}
