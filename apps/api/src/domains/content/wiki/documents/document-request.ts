import type {
    WikiAdminEntryDocumentRevisionParams,
    WikiAdminExportStructuredEntryDocumentRequest,
    WikiAdminPreviewEntryDocumentRequest,
    WikiAdminSaveEntryDocumentRequest,
} from '@imsweb/contracts/wiki';

/** One Wiki entry's document, addressed by its stable entry id. */
export interface WikiEntryDocumentParams {
    entryId: number;
}

/** One retained snapshot of an entry's document. */
export type WikiEntryDocumentRevisionParams =
    WikiAdminEntryDocumentRevisionParams;

export type WikiEntryDocumentSaveRequest = WikiAdminSaveEntryDocumentRequest;
export type WikiEntryDocumentPreviewRequest =
    WikiAdminPreviewEntryDocumentRequest;
export type WikiEntryDocumentExportStructuredRequest =
    WikiAdminExportStructuredEntryDocumentRequest;
