import type {
    WikiAdminExportStructuredEntryDocumentRequest,
    WikiAdminPreviewEntryDocumentRequest,
    WikiAdminSaveEntryDocumentRequest,
} from '@imsweb/contracts/wiki';

/** One Wiki entry's document, addressed by its stable entry id. */
export interface WikiEntryDocumentParams {
    entryId: number;
}

export type WikiEntryDocumentSaveRequest = WikiAdminSaveEntryDocumentRequest;
export type WikiEntryDocumentPreviewRequest =
    WikiAdminPreviewEntryDocumentRequest;
export type WikiEntryDocumentExportStructuredRequest =
    WikiAdminExportStructuredEntryDocumentRequest;
