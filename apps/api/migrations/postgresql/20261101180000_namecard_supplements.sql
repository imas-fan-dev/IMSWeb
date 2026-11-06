-- ims:migration-phase: post-data

-- Registered users may fill in the basic fields of an ownerless wall card.
-- A supplement is its own review object: it carries a partial payload (only the
-- four fields the wall offers), it never touches the live row until a reviewer
-- approves it, and only one supplement may be open per card. Claiming the card
-- supersedes whatever supplement is waiting, so the state vocabulary matches
-- `fudaba_card_claims` and `cancelled` is the outcome a claim forces.
CREATE TABLE IF NOT EXISTS public.fudaba_card_supplements (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    submitter_account_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL,
    base_revision INTEGER NOT NULL,
    review_note TEXT NOT NULL DEFAULT '',
    reviewed_by BIGINT,
    reviewed_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fudaba_card_supplements_id_check
        CHECK (length(btrim(id)) BETWEEN 1 AND 128),
    CONSTRAINT fudaba_card_supplements_card_id_fkey
        FOREIGN KEY (card_id) REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    CONSTRAINT fudaba_card_supplements_submitter_account_id_fkey
        FOREIGN KEY (submitter_account_id)
        REFERENCES public.platform_accounts(id) ON DELETE RESTRICT,
    CONSTRAINT fudaba_card_supplements_reviewed_by_fkey
        FOREIGN KEY (reviewed_by)
        REFERENCES public.backoffice_accounts(id) ON DELETE RESTRICT,
    CONSTRAINT fudaba_card_supplements_state_check
        CHECK (state IN ('pending', 'approving', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT fudaba_card_supplements_payload_check
        CHECK (jsonb_typeof(payload) = 'object' AND payload <> '{}'::jsonb),
    CONSTRAINT fudaba_card_supplements_base_revision_check
        CHECK (base_revision >= 0),
    CONSTRAINT fudaba_card_supplements_revision_check
        CHECK (revision >= 0),
    CONSTRAINT fudaba_card_supplements_review_note_check
        CHECK (length(review_note) <= 2000),
    CONSTRAINT fudaba_card_supplements_updated_at_check
        CHECK (updated_at >= created_at),
    -- A decided row must name its reviewer; an open row must not pretend it has one.
    CONSTRAINT fudaba_card_supplements_review_check CHECK (
        (
            state IN ('approved', 'rejected')
            AND reviewed_by IS NOT NULL
            AND reviewed_at IS NOT NULL
            AND reviewed_at >= created_at
        ) OR (
            state NOT IN ('approved', 'rejected')
            AND reviewed_at IS NULL
        )
    )
);

-- One open supplement per card: the second submitter waits for the first to be
-- decided. Decided rows stay so the same user repeating the same card can be
-- recognised (it earns no second contribution point).
CREATE UNIQUE INDEX IF NOT EXISTS fudaba_card_supplements_one_open_card_idx
    ON public.fudaba_card_supplements (card_id)
    WHERE state IN ('pending', 'approving');

CREATE INDEX IF NOT EXISTS fudaba_card_supplements_queue_idx
    ON public.fudaba_card_supplements (state, created_at ASC, id ASC)
    WHERE state IN ('pending', 'approving');

CREATE INDEX IF NOT EXISTS fudaba_card_supplements_submitter_idx
    ON public.fudaba_card_supplements (submitter_account_id, created_at DESC, id DESC);

-- Claims and supplements share the review queue, so both need the same
-- submitted-at ordering and a payload the reviewer can diff against the live
-- card. Claims already carried the six fields the wall offers.
ALTER TABLE public.fudaba_card_claims
    ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.fudaba_card_claims
    ADD CONSTRAINT fudaba_card_claims_payload_check
        CHECK (jsonb_typeof(payload) = 'object');

-- Contribution points are awarded once per (account, card): a user who keeps
-- re-supplementing the same card does not farm the counter, and the exempt
-- operations (reordering artwork) never reach the approval path at all.
CREATE TABLE IF NOT EXISTS public.namecard_contribution_events (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    points INTEGER NOT NULL,
    supplement_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT namecard_contribution_events_account_id_fkey
        FOREIGN KEY (account_id)
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    CONSTRAINT namecard_contribution_events_card_id_fkey
        FOREIGN KEY (card_id) REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    CONSTRAINT namecard_contribution_events_supplement_id_fkey
        FOREIGN KEY (supplement_id)
        REFERENCES public.fudaba_card_supplements(id) ON DELETE SET NULL,
    CONSTRAINT namecard_contribution_events_kind_check
        CHECK (kind IN ('card-supplement-approved')),
    CONSTRAINT namecard_contribution_events_points_check
        CHECK (points > 0),
    CONSTRAINT namecard_contribution_events_once
        UNIQUE (account_id, card_id, kind)
);

CREATE INDEX IF NOT EXISTS namecard_contribution_events_account_idx
    ON public.namecard_contribution_events (account_id, created_at DESC);

ALTER TABLE public.namecard_notifications
    DROP CONSTRAINT IF EXISTS namecard_notifications_kind_check;

ALTER TABLE public.namecard_notifications
    ADD CONSTRAINT namecard_notifications_kind_check
        CHECK (kind IN (
            'card-approved', 'card-rejected', 'claim-approved', 'claim-rejected',
            'station-message', 'card-locked', 'card-unlocked',
            'card-admin-edited', 'card-transferred-in', 'card-transferred-out',
            'card-feedback-accepted', 'card-feedback-rejected',
            'card-supplement-approved', 'card-supplement-rejected',
            -- An ownerless card whose producer name matches an account invites
            -- that account to claim it.
            'legacy-card-match'
        ));
