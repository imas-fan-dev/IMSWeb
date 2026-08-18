import type {
    AboutAdminSnapshot,
    AboutAdminUpdate,
    AboutGroup,
    AboutImageUpload,
    AboutPageContent,
    AboutPerson,
} from '@imsweb/contracts/about';

export type AboutPersonResponse = AboutPerson;
export type AboutGroupResponse = AboutGroup;
export type AboutPageContentResponse = AboutPageContent;

export type AboutPublicContentResponse = AboutPageContentResponse;

export type AboutAdminContentResponse = AboutAdminSnapshot;
export type AboutUpdateSuccessResponse = AboutAdminUpdate;

export interface AboutMutationErrorResponse {
    error: string;
}

export type AboutImageUploadSuccessResponse = AboutImageUpload;

export type AboutImageUploadResponse =
    | AboutImageUploadSuccessResponse
    | AboutMutationErrorResponse;
