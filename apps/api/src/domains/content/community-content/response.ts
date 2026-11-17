import type {
    CommunityContent,
    CommunityContentErrorResponse,
    AdminCommunityContentSnapshot,
    AdminCommunityContentUpdate,
    AdminCommunityContentImageUpload,
} from '@imsweb/contracts/community-content';
export type CommunityContentPublicReadResponse = CommunityContent;
export type CommunityContentAdminReadResponse = AdminCommunityContentSnapshot;
export type CommunityContentUpdateSuccessResponse = AdminCommunityContentUpdate;
export type CommunityContentImageUploadSuccessResponse =
    AdminCommunityContentImageUpload;
export type CommunityContentMutationErrorResponse =
    CommunityContentErrorResponse;
