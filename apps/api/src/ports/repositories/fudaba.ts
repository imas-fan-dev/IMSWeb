import type { AuditLogInput } from "@/ports/repositories/admin";
import type { WikiImageTransform } from "@/ports/repositories/wiki";

export type FudabaOfficeStatus = "active" | "hidden" | "archived";

export type FudabaCardOrigin = "exchange" | "guest" | "legacy";

export type FudabaCardPublicationStatus =
    | "draft"
    | "pending"
    | "approving"
    | "published"
    | "hidden"
    | "rejected";


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

export interface CardFavoriteSelectionRecord {
    character_id: number;
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
    review_state: FudabaLocationReviewState;
    review_submitted_at: string;
    reviewed_at: string | null;
    reviewed_by: number | null;
    review_note: string;
    review_operation_id: string | null;
    revision: number;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
}

export interface FudabaOwnerOfficeRecord extends FudabaOfficeRecord {
    series_codes: string[];
}

export interface FudabaOfficeReviewRecord {
    office: FudabaOwnerOfficeRecord;
    owner_email: string | null;
    owner_display_name: string | null;
    reviewer_username: string | null;
    reviewer_display_name: string | null;
}

export type FudabaOfficeReviewResult =
    | { status: 'saved'; office: FudabaOwnerOfficeRecord }
    | { status: 'conflict'; revision: number }
    | { status: 'unavailable' };

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
    adminAudit?: AuditLogInput;
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

/** Roles a single credit may carry; one person can design and illustrate. */
export type FudabaCardCreditRole = "design" | "illustration" | "other";

/** A designer or illustrator credited for the artwork. */
export interface FudabaCardCredit {
    /** Site member the credit points at, when it points at one. */
    accountId: string | null;
    displayName: string;
    /** Public profile elsewhere; optional. */
    url: string | null;
    roles: FudabaCardCreditRole[];
}

/** 交换模式: auto allows immediately, manual asks, none refuses. */
export type FudabaExchangeMode = "auto" | "manual" | "none";

/** The copy a submitter asks to publish; mirrors the live columns one to one. */
export interface FudabaPendingCardPayload {
    producer_name: string;
    /** Ordered series; the first entry is the one the legacy column mirrors. */
    series_codes: string[];
    favorite_character_ids: number[];
    bio: string;
    trade_note: string;
    exchange_mode: FudabaExchangeMode;
    made_on: string | null;
    group_name: string | null;
    producer_reading: string | null;
    is_original: boolean;
    made_with_ai: boolean;
    visible: boolean;
    credits: FudabaCardCredit[];
}

/** Verdict on the newest submission of an already published card. */
export type FudabaCardReviewStatus = "pending" | "rejected" | "locked";

export interface FudabaCardRecord {
    id: string;
    /** Public number the owner sees as 名片 #编号. */
    card_number: number;
    owner_account_id: string;
    producer_name: string;
    /** Ordered series; the first entry is the label shown by default. */
    series_codes: string[];
    favorite_characters: CardFavoriteSelectionRecord[];
    legacy_card_id: number | null;
    origin: FudabaCardOrigin;
    front_object_key: string;
    /** Ordered middle pages; empty for a two-sided card. */
    middle_object_keys: string[];
    /** Null for a single-sided card. */
    back_object_key: string | null;
    /** Derived from the artwork; never submitted by the owner. */
    accent: string;
    bio: string;
    trade_note: string;
    exchange_mode: FudabaExchangeMode;
    made_on: string | null;
    group_name: string | null;
    producer_reading: string | null;
    is_original: boolean;
    made_with_ai: boolean;
    visible: boolean;
    credits: FudabaCardCredit[];
    publication_status: FudabaCardPublicationStatus;
    review_status: FudabaCardReviewStatus | null;
    review_reason: string | null;
    review_submitted_at: string | null;
    pending_payload: FudabaPendingCardPayload | null;
    pending_front_object_key: string | null;
    pending_middle_object_keys: string[];
    pending_back_object_key: string | null;
    revision: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface NewFudabaCardInput {
    id: string;
    ownerAccountId: string;
    producerName: string;
    seriesCodes: string[];
    favoriteCharacterIds?: number[];
    legacyCardId?: number | null;
    frontObjectKey: string;
    /** Absent for a single-sided card. */
    backObjectKey?: string | null;
    bio: string;
    tradeNote: string;
    exchangeMode: FudabaExchangeMode;
    madeOn: string | null;
    groupName: string | null;
    producerReading: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    visible: boolean;
    credits?: FudabaCardCredit[];
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
    seriesCodes: string[];
    favoriteCharacterIds?: number[];
    frontObjectKey: string;
    /** Dominant colour sampled from the front artwork, when one was found. */
    accent?: string | null;
    middleObjectKeys?: string[];
    /** Absent for a single-sided card. */
    backObjectKey?: string | null;
    bio: string;
    tradeNote: string;
    exchangeMode: FudabaExchangeMode;
    madeOn: string | null;
    groupName: string | null;
    producerReading: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    visible: boolean;
    credits?: FudabaCardCredit[];
    createdAt: string;
    updatedAt: string;
}

export interface UpdateOwnedFudabaCardMetadataInput {
    cardId: string;
    ownerAccountId: string;
    producerName: string;
    seriesCodes: string[];
    favoriteCharacterIds?: number[];
    bio: string;
    tradeNote: string;
    exchangeMode: FudabaExchangeMode;
    madeOn: string | null;
    groupName: string | null;
    producerReading: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    visible: boolean;
    credits?: FudabaCardCredit[];
    expectedRevision: number;
    updatedAt: string;
}

export interface UpdateOwnedFudabaCardMediaInput {
    cardId: string;
    ownerAccountId: string;
    side: "front" | "back";
    /** Null clears the back image, turning the card single-sided. */
    objectKey: string | null;
    /** Dominant colour of the new front image; ignored for the back side. */
    accent?: string | null;
    expectedRevision: number;
    updatedAt: string;
}

export interface ReplaceOwnedFudabaCardMediaInput {
    cardId: string;
    ownerAccountId: string;
    /**
     * Complete replacement of the card artwork: slot 0 is the front, slot 1 the
     * back (null for a single-sided card) and the rest are the ordered middle
     * pages. Positions are decided by the submitter, so one request can replace
     * an image, reorder the set and move pages across roles at once.
     */
    frontObjectKey: string;
    backObjectKey: string | null;
    middleObjectKeys: string[];
    /** Accent sampled from a newly uploaded front image, if any. */
    accent?: string | null;
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
          /** Ordered middle pages the write displaced, for object cleanup. */
          previousObjectKeys?: string[];
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
    favorite_characters: CardFavoriteSelectionRecord[];
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
    claimer_name: string | null;
}

export interface CreateFudabaCardClaimInput {
    id: string;
    legacyCardId: number;
    claimantAccountId: string;
    targetCardId: string | null;
    seriesCode: string | null;
    characterIds: number[];
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
    | { status: "series-required" }
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
    producerReading: string | null;
    seriesCode: string;
    frontObjectKey: string;
    backObjectKey: string | null;
    accent: string;
    bio: string;
    tradeNote: string;
    exchangeMode: "auto" | "manual" | "none";
    madeOn: string | null;
    groupName: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    visible: boolean;
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
    public_latitude_e1?: number | null;
    public_longitude_e1?: number | null;
    public_precision?: 'regional' | 'exact' | null;
    public_latitude_exact?: number | null;
    public_longitude_exact?: number | null;
}

export interface FudabaPublicOfficeCursor {
    visitorCount: number;
    id: string;
}

export interface ListFudabaPublicOfficesInput {
    q?: string;
    city?: string;
    seriesCodes?: string[];
    isOpen?: boolean;
    limit: number;
    after?: FudabaPublicOfficeCursor;
}

export type FudabaLocationReviewState = "pending" | "published" | "rejected";

export interface FudabaOfficePublicLocationRecord {
    office_id: string;
    precision: 'regional' | 'exact';
    latitude_exact: number | null;
    longitude_exact: number | null;
    exact_location_consent_at: string | null;
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
    precision: 'regional' | 'exact';
    latitude_exact: number | null;
    longitude_exact: number | null;
}

export interface ListFudabaPublicMapOfficesInput {
    bbox: {
        west: number;
        south: number;
        east: number;
        north: number;
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
    /** Ordered series; the first entry is the label shown by default. */
    series_codes: string[];
    favorite_characters: CardFavoriteSelectionRecord[];
    front_object_key: string;
    middle_object_keys: string[];
    back_object_key: string | null;
    accent: string;
    bio: string;
    trade_note: string;
    exchange_mode: FudabaExchangeMode;
    made_on: string | null;
    group_name: string | null;
    producer_reading: string | null;
    is_original: boolean;
    made_with_ai: boolean;
    visible: boolean;
    credits: FudabaCardCredit[];
    created_at: string;
    like_count: number;
    favorite_count: number;
    viewer_liked: boolean;
    viewer_favorited: boolean;
}

export interface FudabaCardReactionRecord {
    emoji: string;
    count: number;
}

export interface FudabaCardReactionInput {
    cardId: string;
    emoji: string;
    delta: 1 | -1;
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
    /** True keeps cards offered for exchange, false keeps the closed ones. */
    exchangeable?: boolean;
    officeSlug?: string;
    favoritedByAccountId?: string;
    viewerAccountId: string | null;
    limit: number;
    after?: FudabaPublicCardCursor;
}

export interface FudabaRepository {
    listOfficeReviews(input: { reviewState?: FudabaLocationReviewState; limit: number }): Promise<FudabaOfficeReviewRecord[]>;
    findOfficeReview(officeId: string): Promise<FudabaOfficeReviewRecord | null>;
    beginOfficeReview(input: { officeId: string; expectedRevision: number; operationId: string; expectedReviewState?: 'pending' | 'published' }): Promise<FudabaOfficeReviewResult>;
    completeOfficeReview(input: {
        officeId: string; expectedRevision: number; operationId: string;
        decision: 'publish' | 'reject' | 'withdraw'; reviewedAt: string; reviewedBy: number;
        reviewNote: string; pendingCoverObjectKey: string | null; audit: AuditLogInput;
    }): Promise<FudabaOfficeReviewResult>;
    releaseOfficeReview(input: { officeId: string; expectedRevision: number; operationId: string; expectedReviewState?: 'pending' | 'published' }): Promise<boolean>;
    listPublicSeries(): Promise<FudabaPublicSeriesRecord[]>;
    /**
     * Every taggable series, including ones without a wiki section: an owner
     * must be able to file a card that belongs to no published branch under
     * 「其他」 instead of picking a wrong one.
     */
    listOwnerSeries(): Promise<FudabaPublicSeriesRecord[]>;
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
    listPublicCardReactions(cardId: string): Promise<FudabaCardReactionRecord[]>;
    applyPublicCardReaction(input: FudabaCardReactionInput): Promise<boolean>;
    /** Readers report a published card; one open report per reader per card. */
    createCardFeedback(
        input: CreateNamecardFeedbackInput,
    ): Promise<'created' | 'duplicate' | 'not-found'>;
    listPendingCardFeedback(
        input: { page: number; pageSize: number },
    ): Promise<{ items: NamecardFeedbackRecord[]; total: number }>;
    /** Moves one report out of the queue; null when it was already handled. */
    resolveCardFeedback(
        input: ResolveNamecardFeedbackInput,
    ): Promise<NamecardFeedbackRecord | null>;
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
        precision?: 'regional' | 'exact';
        latitudeExact?: number | null;
        longitudeExact?: number | null;
        exactLocationConsentAt?: string | null;
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
    listCardFavorites(
        cardIds: string[],
    ): Promise<Map<string, CardFavoriteSelectionRecord[]>>;
    attachCardFavorites(
        cardId: string,
        characterIds: number[],
    ): Promise<CardFavoriteSelectionRecord[] | null>;
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
    /** Replaces the whole ordered middle-page set of one card. */
    replaceCardMediaForOwner(
        input: ReplaceOwnedFudabaCardMediaInput,
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
        /** `flag` marks the submission as a violation and leaves live content up. */
        decision: "publish" | "reject" | "flag";
        reviewedAt: string;
        /** Reviewer note, forwarded as the rejection reason to the owner. */
        note?: string | null;
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

export type NamecardFeedbackReason =
    | 'info-error'
    | 'ownership-error'
    | 'content-violation';

export type NamecardFeedbackStatus = 'pending' | 'accepted' | 'rejected';

export interface NamecardFeedbackRecord {
    id: number;
    cardId: string;
    cardNumber: number;
    producerName: string | null;
    frontObjectKey: string;
    backObjectKey: string | null;
    middlePageCount: number;
    reporterAccountId: string;
    reporterName: string;
    reason: NamecardFeedbackReason;
    detail: string | null;
    status: NamecardFeedbackStatus;
    createdAt: string;
}

export interface CreateNamecardFeedbackInput {
    cardId: string;
    reporterAccountId: string;
    reason: NamecardFeedbackReason;
    detail: string | null;
    createdAt: string;
}

export interface ResolveNamecardFeedbackInput {
    id: number;
    outcome: 'accepted' | 'rejected';
    handledBy: string;
    updatedAt: string;
}
