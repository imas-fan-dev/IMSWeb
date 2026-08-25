import type { AuditLogInput } from "@/ports/repositories/admin";
import type { WikiImageTransform } from "@/ports/repositories/wiki";

export type FudabaOfficeStatus = "active" | "hidden" | "archived";

export type FudabaCardPublicationStatus =
    | "draft"
    | "pending"
    | "approving"
    | "published"
    | "hidden"
    | "rejected";

export type FudabaMediaRightsStatus = "unknown" | "approved" | "denied";

export type FudabaCardClaimState =
    | "pending"
    | "approving"
    | "approved"
    | "rejected"
    | "cancelled";

export type FudabaClaimEnvelopeKind =
    | "legacy-card-match"
    | "claim-approved"
    | "claim-rejected";

export type FudabaClaimEnvelopeActionState =
    | "pending"
    | "confirmed"
    | "declined"
    | "none";

export interface CardIdolSelectionRecord {
    idol_id: number;
    agency_code: string;
    name_cn: string;
    display_order: number;
}

export type FudabaExchangeStatus =
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled";

export type FudabaModerationResourceKind =
    | "account"
    | "office"
    | "card"
    | "message"
    | "exchange";

export type FudabaModerationState =
    | "open"
    | "reviewing"
    | "resolved"
    | "dismissed"
    | "appealed";

export interface FudabaOfficeRecord {
    id: string;
    owner_account_id: string;
    slug: string;
    name: string;
    intro: string;
    city: string;
    address: string;
    latitude: number;
    longitude: number;
    accent: string;
    cover_object_key: string | null;
    pending_cover_object_key: string | null;
    pending_cover_submitted_at: string | null;
    is_open: boolean;
    visitor_count: number;
    status: FudabaOfficeStatus;
    revision: number;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
}

export interface FudabaOwnerOfficeRecord extends FudabaOfficeRecord {
    series_codes: string[];
}

export interface NewFudabaOfficeInput {
    id: string;
    ownerAccountId: string;
    slug: string;
    name: string;
    intro: string;
    city: string;
    address: string;
    latitude: number;
    longitude: number;
    accent: string;
    coverObjectKey: string | null;
    isOpen: boolean;
    visitorCount: number;
    status: FudabaOfficeStatus;
    revision: number;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    seriesCodes: string[];
}

export interface CreateOwnedFudabaOfficeInput extends NewFudabaOfficeInput {
    idempotencyKeyHash: string;
    requestHash: string;
    receiptCreatedAt: number;
}

export interface UpdateOwnedFudabaOfficeInput {
    officeId: string;
    ownerAccountId: string;
    name: string;
    intro: string;
    city: string;
    address: string;
    latitude: number;
    longitude: number;
    accent: string;
    isOpen: boolean;
    seriesCodes: string[];
    expectedRevision: number;
    updatedAt: string;
}

export type FudabaOfficeMutationResult =
    | {
          status: "saved";
          office: FudabaOwnerOfficeRecord;
          previousPendingObjectKey: string | null;
      }
    | { status: "conflict"; revision: number }
    | { status: "pending-exists"; revision: number }
    | {
          status: "state-conflict";
          revision: number;
          officeStatus: FudabaOfficeStatus;
      }
    | { status: "unavailable" };

export type FudabaOfficeCreateResult =
    | FudabaOfficeMutationResult
    | { status: "idempotency-conflict" };

export interface FudabaCardRecord {
    id: string;
    owner_account_id: string;
    producer_name: string;
    display_name: string;
    series_code: string;
    favorite_idol: string;
    favorite_idols: CardIdolSelectionRecord[];
    legacy_card_id: number | null;
    front_object_key: string;
    back_object_key: string;
    accent: string;
    bio: string;
    trade_note: string;
    available: boolean;
    source_url: string | null;
    source_label: string | null;
    source_credit: string | null;
    media_rights_status: FudabaMediaRightsStatus;
    publication_status: FudabaCardPublicationStatus;
    revision: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface NewFudabaCardInput {
    id: string;
    ownerAccountId: string;
    producerName: string;
    displayName: string;
    seriesCode: string;
    favoriteIdol: string;
    favoriteIdolIds?: number[];
    legacyCardId?: number | null;
    frontObjectKey: string;
    backObjectKey: string;
    accent: string;
    bio: string;
    tradeNote: string;
    available: boolean;
    sourceUrl: string | null;
    sourceLabel: string | null;
    sourceCredit: string | null;
    mediaRightsStatus: FudabaMediaRightsStatus;
    publicationStatus: FudabaCardPublicationStatus;
    revision: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}

export interface CreateOwnedFudabaCardInput {
    id: string;
    ownerAccountId: string;
    producerName: string;
    displayName: string;
    seriesCode: string;
    favoriteIdol: string;
    favoriteIdolIds?: number[];
    frontObjectKey: string;
    backObjectKey: string;
    accent: string;
    bio: string;
    tradeNote: string;
    available: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface UpdateOwnedFudabaCardMetadataInput {
    cardId: string;
    ownerAccountId: string;
    producerName: string;
    displayName: string;
    seriesCode: string;
    favoriteIdol: string;
    favoriteIdolIds?: number[];
    accent: string;
    bio: string;
    tradeNote: string;
    available: boolean;
    expectedRevision: number;
    updatedAt: string;
}

export interface UpdateOwnedFudabaCardMediaInput {
    cardId: string;
    ownerAccountId: string;
    side: "front" | "back";
    objectKey: string;
    expectedRevision: number;
    updatedAt: string;
}

export interface SoftDeleteOwnedFudabaCardInput {
    cardId: string;
    ownerAccountId: string;
    expectedRevision: number;
    deletedAt: string;
}

export type FudabaCardMutationResult =
    | {
          status: "saved";
          card: FudabaCardRecord;
          previousObjectKey: string | null;
      }
    | { status: "conflict"; revision: number }
    | { status: "unavailable" };

export interface FudabaClaimEnvelopeRecord {
    id: number;
    recipient_account_id: string;
    legacy_card_id: number;
    kind: FudabaClaimEnvelopeKind;
    action_state: FudabaClaimEnvelopeActionState;
    claim_id: string | null;
    title: string;
    body: string;
    read_at: string | null;
    actioned_at: string | null;
    created_at: string;
    revision: number;
}

export interface FudabaCardClaimRecord {
    id: string;
    legacy_card_id: number;
    claimant_account_id: string;
    target_card_id: string | null;
    series_code: string;
    state: FudabaCardClaimState;
    message: string;
    review_note: string;
    reviewed_by: number | null;
    reviewed_at: string | null;
    revision: number;
    created_at: string;
    updated_at: string;
    favorite_idols: CardIdolSelectionRecord[];
}

export interface FudabaRegisteredCardReviewRecord extends FudabaCardRecord {
    owner_display_name: string;
}

export interface FudabaAdminCardClaimRecord extends FudabaCardClaimRecord {
    claimant_display_name: string;
    legacy_image1_url: string;
    legacy_image2_url: string;
}

export interface LegacyNamecardClaimStatusRecord {
    legacy_card_id: number;
    claim_status: "unclaimed" | "pending" | "claimed";
    viewer_claim_state: FudabaCardClaimState | null;
}

export interface CreateFudabaCardClaimInput {
    id: string;
    legacyCardId: number;
    claimantAccountId: string;
    targetCardId: string | null;
    seriesCode: string;
    idolIds: number[];
    message: string;
    createdAt: string;
    updatedAt: string;
}

export interface ConfirmFudabaLegacyEnvelopeInput
    extends Omit<
        CreateFudabaCardClaimInput,
        "legacyCardId" | "claimantAccountId"
    > {
    envelopeId: number;
    recipientAccountId: string;
    expectedRevision: number;
    actionedAt: string;
}

export type FudabaClaimCreateResult =
    | { status: "created"; claim: FudabaCardClaimRecord }
    | { status: "conflict"; claimId: string; state: FudabaCardClaimState }
    | { status: "unavailable" };

export type FudabaEnvelopeActionResult =
    | { status: "saved"; envelope: FudabaClaimEnvelopeRecord }
    | { status: "conflict"; revision: number }
    | { status: "unavailable" };

export type FudabaEnvelopeClaimResult =
    | {
          status: "created";
          envelope: FudabaClaimEnvelopeRecord;
          claim: FudabaCardClaimRecord;
      }
    | { status: "conflict"; revision: number }
    | { status: "unavailable" };

export type FudabaRegisteredCardReviewClaim =
    | { status: "claimed"; card: FudabaRegisteredCardReviewRecord }
    | {
          status: "conflict";
          revision: number;
          publicationStatus: FudabaCardPublicationStatus;
      }
    | { status: "unavailable" };

export type FudabaRegisteredCardReviewResult =
    | { status: "saved"; card: FudabaRegisteredCardReviewRecord }
    | {
          status: "conflict";
          revision: number;
          publicationStatus: FudabaCardPublicationStatus;
      }
    | { status: "unavailable" };

export type FudabaClaimReviewClaim =
    | { status: "claimed"; claim: FudabaCardClaimRecord }
    | { status: "conflict"; revision: number; state: FudabaCardClaimState }
    | { status: "unavailable" };

export interface CreateClaimedFudabaCardInput {
    id: string;
    producerName: string;
    displayName: string;
    frontObjectKey: string;
    backObjectKey: string;
    accent: string;
    bio: string;
    tradeNote: string;
    available: boolean;
}

interface CompleteFudabaClaimReviewBaseInput {
    claimId: string;
    approvingRevision: number;
    reviewedBy: number;
    reviewedAt: string;
    reviewNote: string;
    notificationTitle: string;
    notificationBody: string;
    audit: AuditLogInput;
}

export type CompleteFudabaClaimReviewInput =
    | (CompleteFudabaClaimReviewBaseInput & {
          decision: "approve";
          target:
              | { kind: "existing"; cardId: string }
              | { kind: "create"; card: CreateClaimedFudabaCardInput };
      })
    | (CompleteFudabaClaimReviewBaseInput & {
          decision: "reject";
      });

export type FudabaClaimReviewResult =
    | {
          status: "saved";
          claim: FudabaCardClaimRecord;
          card: FudabaCardRecord | null;
      }
    | { status: "conflict"; revision: number; state: FudabaCardClaimState }
    | { status: "unavailable" };

export interface FudabaExchangeRequestRecord {
    id: string;
    office_id: string;
    requester_account_id: string;
    recipient_account_id: string;
    wanted_card_id: string;
    offered_card_id: string | null;
    note: string;
    status: FudabaExchangeStatus;
    version: number;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
}

export interface NewFudabaModerationCaseInput {
    id: string;
    resourceKind: FudabaModerationResourceKind;
    resourceId: string;
    reporterAccountId: string | null;
    reason: string;
    details: string;
    state: FudabaModerationState;
    backofficeActorId: number | null;
    resolution: string;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
}

export interface FudabaModerationCaseRecord {
    id: string;
    resource_kind: FudabaModerationResourceKind;
    resource_id: string;
    reporter_account_id: string | null;
    reason: string;
    details: string;
    state: FudabaModerationState;
    backoffice_actor_id: number | null;
    resolution: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
}

export interface FudabaPublicSeriesRecord {
    id: number;
    code: string;
    display_name: string;
    color: string;
    display_order: number;
    icon_object_key: string | null;
    image_transform: WikiImageTransform;
    active_office_count: number;
}

export interface FudabaPublicOfficeRecord {
    id: string;
    slug: string;
    name: string;
    intro: string;
    city: string;
    address: string;
    accent: string;
    cover_object_key: string | null;
    is_open: boolean;
    visitor_count: number;
    series_codes: string[];
}

export interface FudabaPublicOfficeCursor {
    visitorCount: number;
    id: string;
}

export interface ListFudabaPublicOfficesInput {
    city?: string;
    seriesCodes?: string[];
    isOpen?: boolean;
    limit: number;
    after?: FudabaPublicOfficeCursor;
}

export type FudabaLocationReviewState = "pending" | "published" | "rejected";

export interface FudabaOfficePublicLocationRecord {
    office_id: string;
    latitude_e1: number;
    longitude_e1: number;
    review_state: FudabaLocationReviewState;
    revision: number;
    submitted_at: string;
    reviewed_at: string | null;
    reviewed_by: number | null;
    review_note: string;
}

export interface FudabaPublicMapOfficeRecord {
    id: string;
    slug: string;
    name: string;
    city: string;
    address: string;
    accent: string;
    is_open: boolean;
    series_codes: string[];
    latitude_e1: number;
    longitude_e1: number;
}

export interface ListFudabaPublicMapOfficesInput {
    bbox: {
        westE1: number;
        southE1: number;
        eastE1: number;
        northE1: number;
    };
    city?: string;
    seriesCodes?: string[];
    isOpen?: boolean;
    limit: number;
}

export interface FudabaOfficeLocationReviewRecord
    extends FudabaOfficePublicLocationRecord {
    office_name: string;
    office_city: string;
    owner_account_id: string;
}

export type FudabaOfficeLocationMutationResult =
    | { status: "saved"; location: FudabaOfficePublicLocationRecord }
    | { status: "conflict"; revision: number }
    | { status: "unavailable" };

export interface FudabaPublicCardRecord {
    id: string;
    producer_name: string;
    display_name: string;
    series_code: string;
    favorite_idol: string;
    favorite_idols: CardIdolSelectionRecord[];
    front_object_key: string;
    back_object_key: string;
    accent: string;
    bio: string;
    trade_note: string;
    available: boolean;
    source_url: string | null;
    source_label: string | null;
    source_credit: string | null;
    created_at: string;
    like_count: number;
    favorite_count: number;
    viewer_liked: boolean;
    viewer_favorited: boolean;
}

export interface FudabaCardInteractionStateRecord {
    like_count: number;
    favorite_count: number;
    viewer_liked: boolean;
    viewer_favorited: boolean;
}

export interface FudabaPublicPlacedCardRecord extends FudabaPublicCardRecord {
    pinned_at: string;
    position_x: number;
    position_y: number;
    rotation: number;
    z_index: number;
    revision: number;
    updated_at: string;
    viewer_owned: boolean;
}

export interface FudabaCardPlacementRecord {
    office_id: string;
    card_id: string;
    pinned_at: string;
    position_x: number;
    position_y: number;
    rotation: number;
    z_index: number;
    revision: number;
    updated_at: string;
}

export type FudabaCardPlacementSaveResult =
    | {
          status: "saved";
          placement: FudabaCardPlacementRecord;
          created: boolean;
      }
    | { status: "conflict"; revision: number }
    | { status: "unavailable" };

export type FudabaCardPlacementRemovalResult =
    | { status: "removed"; revision: number }
    | { status: "conflict"; revision: number }
    | { status: "in-use"; revision: number }
    | { status: "unavailable" };

export interface FudabaPublicOfficeDetailRecord
    extends FudabaPublicOfficeRecord {
    cards: FudabaPublicPlacedCardRecord[];
}

export interface FudabaPublicCardCursor {
    createdAt: string;
    id: string;
}

export interface ListFudabaPublicCardsInput {
    seriesCodes?: string[];
    available?: boolean;
    officeSlug?: string;
    favoritedByAccountId?: string;
    viewerAccountId: string | null;
    limit: number;
    after?: FudabaPublicCardCursor;
}

export interface FudabaRepository {
    listPublicSeries(): Promise<FudabaPublicSeriesRecord[]>;
    listPublicOffices(
        input: ListFudabaPublicOfficesInput,
    ): Promise<FudabaPublicOfficeRecord[]>;
    listPublicMapOffices(
        input: ListFudabaPublicMapOfficesInput,
    ): Promise<FudabaPublicMapOfficeRecord[]>;
    findPublicOfficeBySlug(
        slug: string,
        viewerAccountId: string | null,
    ): Promise<FudabaPublicOfficeDetailRecord | null>;
    listPublicCards(
        input: ListFudabaPublicCardsInput,
    ): Promise<FudabaPublicCardRecord[]>;
    findPublicCardInteractions(
        cardId: string,
        viewerAccountId: string | null,
    ): Promise<FudabaCardInteractionStateRecord | null>;
    createOffice(input: NewFudabaOfficeInput): Promise<FudabaOfficeRecord>;
    findOfficeById(id: string): Promise<FudabaOfficeRecord | null>;
    listOfficesForOwner(
        ownerAccountId: string,
    ): Promise<FudabaOwnerOfficeRecord[]>;
    findOfficeForOwner(
        officeId: string,
        ownerAccountId: string,
    ): Promise<FudabaOwnerOfficeRecord | null>;
    createOfficeForOwner(
        input: CreateOwnedFudabaOfficeInput,
    ): Promise<FudabaOfficeCreateResult>;
    updateOfficeForOwner(
        input: UpdateOwnedFudabaOfficeInput,
    ): Promise<FudabaOfficeMutationResult>;
    archiveOfficeForOwner(input: {
        officeId: string;
        ownerAccountId: string;
        expectedRevision: number;
        archivedAt: string;
    }): Promise<FudabaOfficeMutationResult>;
    restoreOfficeForOwner(input: {
        officeId: string;
        ownerAccountId: string;
        expectedRevision: number;
        restoredAt: string;
    }): Promise<FudabaOfficeMutationResult>;
    reservePendingOfficeCoverForOwner(input: {
        officeId: string;
        ownerAccountId: string;
        objectKey: string;
        expectedRevision: number;
        submittedAt: string;
    }): Promise<FudabaOfficeMutationResult>;
    clearPendingOfficeCoverForOwner(input: {
        officeId: string;
        ownerAccountId: string;
        objectKey: string;
        expectedRevision: number;
        updatedAt: string;
    }): Promise<FudabaOfficeMutationResult>;
    updateOfficeStatusForOwner(input: {
        officeId: string;
        ownerAccountId: string;
        status: FudabaOfficeStatus;
        archivedAt: string | null;
        updatedAt: string;
        expectedRevision: number;
    }): Promise<boolean>;
    findOfficePublicLocationForOwner(
        officeId: string,
        ownerAccountId: string,
    ): Promise<FudabaOfficePublicLocationRecord | null>;
    saveOfficePublicLocationForOwner(input: {
        officeId: string;
        ownerAccountId: string;
        latitudeE1: number;
        longitudeE1: number;
        expectedRevision: number | null;
        submittedAt: string;
    }): Promise<FudabaOfficeLocationMutationResult>;
    withdrawOfficePublicLocationForOwner(input: {
        officeId: string;
        ownerAccountId: string;
        expectedRevision: number;
    }): Promise<FudabaOfficeLocationMutationResult>;
    listOfficeLocationReviews(input: {
        reviewState?: FudabaLocationReviewState;
        limit: number;
    }): Promise<FudabaOfficeLocationReviewRecord[]>;
    reviewOfficePublicLocation(input: {
        officeId: string;
        decision: "publish" | "reject";
        expectedRevision: number;
        reviewedAt: string;
        reviewedBy: number;
        reviewNote: string;
        reviewOperationId: string;
        audit: AuditLogInput;
    }): Promise<FudabaOfficeLocationMutationResult>;
    createCard(input: NewFudabaCardInput): Promise<FudabaCardRecord>;
    findCardById(id: string): Promise<FudabaCardRecord | null>;
    listCardsForOwner(ownerAccountId: string): Promise<FudabaCardRecord[]>;
    listCardIdols(
        cardIds: string[],
    ): Promise<Map<string, CardIdolSelectionRecord[]>>;
    attachCardIdols(
        cardId: string,
        idolIds: number[],
    ): Promise<CardIdolSelectionRecord[] | null>;
    findCardForOwner(
        cardId: string,
        ownerAccountId: string,
    ): Promise<FudabaCardRecord | null>;
    createCardForOwner(
        input: CreateOwnedFudabaCardInput,
    ): Promise<FudabaCardMutationResult>;
    updateCardMetadataForOwner(
        input: UpdateOwnedFudabaCardMetadataInput,
    ): Promise<FudabaCardMutationResult>;
    updateCardMediaForOwner(
        input: UpdateOwnedFudabaCardMediaInput,
    ): Promise<FudabaCardMutationResult>;
    softDeleteCardForOwner(
        input: SoftDeleteOwnedFudabaCardInput,
    ): Promise<FudabaCardMutationResult>;
    ensureSameIdLegacyCardEnvelopes(input: {
        title: string;
        body: string;
        createdAt: string;
    }): Promise<FudabaClaimEnvelopeRecord[]>;
    listClaimEnvelopesForOwner(
        recipientAccountId: string,
        limit: number,
    ): Promise<FudabaClaimEnvelopeRecord[]>;
    markClaimEnvelopeRead(input: {
        envelopeId: number;
        recipientAccountId: string;
        expectedRevision: number;
        readAt: string;
    }): Promise<FudabaEnvelopeActionResult>;
    actionClaimEnvelope(input: {
        envelopeId: number;
        recipientAccountId: string;
        action: "decline";
        expectedRevision: number;
        actionedAt: string;
    }): Promise<FudabaEnvelopeActionResult>;
    confirmLegacyCardEnvelope(
        input: ConfirmFudabaLegacyEnvelopeInput,
    ): Promise<FudabaEnvelopeClaimResult>;
    createCardClaimForOwner(
        input: CreateFudabaCardClaimInput,
    ): Promise<FudabaClaimCreateResult>;
    listCardClaimsForOwner(
        claimantAccountId: string,
        limit: number,
    ): Promise<FudabaCardClaimRecord[]>;
    listLegacyNamecardClaimStatuses(
        legacyCardIds: number[],
        viewerAccountId: string | null,
    ): Promise<LegacyNamecardClaimStatusRecord[]>;
    findRegisteredCardForAdmin(
        cardId: string,
    ): Promise<FudabaCardRecord | null>;
    listAdminPendingCards(
        limit: number,
    ): Promise<FudabaRegisteredCardReviewRecord[]>;
    findAdminCardClaim(
        claimId: string,
    ): Promise<FudabaAdminCardClaimRecord | null>;
    listAdminPendingClaims(
        limit: number,
    ): Promise<FudabaAdminCardClaimRecord[]>;
    beginRegisteredCardReview(
        cardId: string,
        expectedRevision: number,
    ): Promise<FudabaRegisteredCardReviewClaim>;
    rollbackRegisteredCardReview(
        cardId: string,
        approvingRevision: number,
    ): Promise<boolean>;
    completeRegisteredCardReview(input: {
        cardId: string;
        approvingRevision: number;
        decision: "publish" | "reject";
        reviewedAt: string;
        audit: AuditLogInput;
    }): Promise<FudabaRegisteredCardReviewResult>;
    beginCardClaimReview(
        claimId: string,
        expectedRevision: number,
    ): Promise<FudabaClaimReviewClaim>;
    rollbackCardClaimReview(
        claimId: string,
        approvingRevision: number,
    ): Promise<boolean>;
    completeCardClaimReview(
        input: CompleteFudabaClaimReviewInput,
    ): Promise<FudabaClaimReviewResult>;
    placeOwnedCard(input: {
        officeId: string;
        cardId: string;
        ownerAccountId: string;
        pinnedAt: string;
        positionX: number;
        positionY: number;
        rotation: number;
        zIndex: number;
    }): Promise<boolean>;
    saveCardPlacementForOwner(input: {
        officeId: string;
        cardId: string;
        ownerAccountId: string;
        positionX: number;
        positionY: number;
        rotation: number;
        zIndex: number;
        expectedRevision: number | null;
        updatedAt: string;
    }): Promise<FudabaCardPlacementSaveResult>;
    removeCardPlacementForOwner(input: {
        officeId: string;
        cardId: string;
        ownerAccountId: string;
        expectedRevision: number;
    }): Promise<FudabaCardPlacementRemovalResult>;
    createMessage(input: {
        id: string;
        officeId: string;
        authorAccountId: string;
        content: string;
        createdAt: string;
    }): Promise<boolean>;
    createExchangeRequest(input: {
        id: string;
        officeId: string;
        requesterAccountId: string;
        recipientAccountId: string;
        wantedCardId: string;
        offeredCardId: string | null;
        note: string;
        createdAt: string;
    }): Promise<FudabaExchangeRequestRecord | null>;
    setCardInteraction(input: {
        kind: "like" | "favorite";
        cardId: string;
        accountId: string;
        active: boolean;
        createdAt: string;
    }): Promise<boolean>;
    createModerationCase(
        input: NewFudabaModerationCaseInput,
    ): Promise<FudabaModerationCaseRecord>;
}
