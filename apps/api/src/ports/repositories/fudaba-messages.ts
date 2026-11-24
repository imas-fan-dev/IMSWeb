import type { FudabaWallLayoutItem } from '@imsweb/contracts/fudaba/messages';
import type {
    FudabaMessage,
    FudabaMessageColor,
    FudabaMessageEditInput,
    FudabaMessagePlacementInput,
    FudabaMessageListResponse,
} from '@imsweb/contracts/fudaba/messages';
import type {
    FudabaPublicPlacedCardRecord,
    FudabaPublicWallRecord,
} from '@/ports/repositories/fudaba';

export type FudabaMessageFailure = {
    status:
        | 'forbidden'
        | 'not-found'
        | 'closed'
        | 'not-editable'
        | 'conflict'
        | 'limited'
        | 'idempotency-conflict'
        | 'gone';
    revision?: number;
    retryAfter?: number;
};
export type FudabaMessageResult =
    | { status: 'ok'; message: FudabaMessage }
    | FudabaMessageFailure;
export interface FudabaMixedWallQuery {
    limit: number;
    scope: string;
    cursor?: string;
    bbox?: [number, number, number, number];
    item?: string;
}
export interface FudabaMixedWallRecord {
    office: FudabaPublicWallRecord['office'];
    wall: FudabaPublicWallRecord['wall'];
    items: (
        | { kind: 'card'; card: FudabaPublicPlacedCardRecord; canMove: boolean }
        | { kind: 'message'; message: FudabaMessage }
    )[];
    pageInfo: FudabaMessageListResponse['pageInfo'];
    capabilities: {
        canCreateMessage: boolean;
        canArrangeWall: boolean;
        canManageMessages: boolean;
    };
}
export interface FudabaMessagesRepository {
    listLayoutBackfill(
        after: string,
        limit: number
    ): Promise<
        {
            id: string;
            content: string;
            contentRevision: number;
            height: number;
        }[]
    >;
    applyLayoutBackfill(
        id: string,
        expectedRevision: number,
        height: number
    ): Promise<'ok' | 'conflict' | 'gone'>;
    listPreviewBackfill(
        after: string,
        limit: number
    ): Promise<(FudabaMediaPreviewGuard & { objectKey: string })[]>;
    saveMediaPreview(
        objectKey: string,
        assetSha256: string,
        preview: string | null,
        guard: FudabaMediaPreviewGuard
    ): Promise<boolean>;
    layouts(
        items: FudabaMixedWallRecord['items'],
        includeBack?: boolean
    ): Promise<FudabaWallLayoutItem[]>;
    read(messageId: string, actorId: string): Promise<FudabaMessageResult>;
    readWall(
        slug: string,
        actorId: string | null,
        query: FudabaMixedWallQuery
    ): Promise<FudabaMixedWallRecord | null>;
    create(input: {
        id: string;
        officeId: string;
        actorId: string;
        content: string;
        height?: number;
        color: FudabaMessageColor;
        center?: { x: number; y: number };
        keyHash: string;
        requestHash: string;
        now: string;
    }): Promise<FudabaMessageResult>;
    edit(
        messageId: string,
        actorId: string,
        input: FudabaMessageEditInput,
        now: string
    ): Promise<FudabaMessageResult>;
    place(
        messageId: string,
        actorId: string,
        input: FudabaMessagePlacementInput,
        now: string
    ): Promise<FudabaMessageResult>;
    destroy(
        messageId: string,
        actorId: string
    ): Promise<{ status: 'ok' } | FudabaMessageFailure>;
    moderate(
        messageId: string,
        actorId: string,
        layer: 'office' | 'admin',
        hidden: boolean,
        expectedRevision: number,
        now: string
    ): Promise<FudabaMessageResult>;
    list(input: {
        actorId: string;
        mode: 'mine' | 'office' | 'admin';
        officeId?: string;
        status?: 'all' | 'visible' | 'office-hidden' | 'admin-hidden';
        limit: number;
        cursor?: string;
        scope: string;
    }): Promise<FudabaMessageListResponse | null>;
}

export type FudabaMediaPreviewGuard = {
    cardId: string;
    revision: number;
    side: 'front' | 'back';
};
