export type NewsResponseId = number | string;

export type PublicNewsItemResponse = {
    id: NewsResponseId;
    title: string;
    thumbnail: string | null;
    content: string;
    date: string | null;
};

export type AdminNewsItemResponse = PublicNewsItemResponse & {
    image: string | null;
    author: string | null;
};

export type PublicNewsListResponse = PublicNewsItemResponse[];

export interface NewsPageInfoResponse {
    nextCursor: string | null;
    hasNextPage: boolean;
    snapshotAt: string | null;
}

export interface NewsCursorPageResponse {
    items: PublicNewsItemResponse[];
    pageInfo: NewsPageInfoResponse;
}

export interface NewsMutationSuccessResponse {
    success: true;
}

export interface NewsMutationErrorResponse {
    success: false;
    msg: string;
}

export type AdminNewsListResponse =
    | { success: true; data: AdminNewsItemResponse[] }
    | NewsMutationErrorResponse;
