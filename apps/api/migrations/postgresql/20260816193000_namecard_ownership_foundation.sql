-- ims:migration-phase: post-data

ALTER TABLE public.cards
    ADD COLUMN series_code TEXT,
    ADD COLUMN submission_kind TEXT;

UPDATE public.cards
SET submission_kind = 'legacy';

ALTER TABLE public.cards
    ALTER COLUMN submission_kind SET DEFAULT 'guest',
    ALTER COLUMN submission_kind SET NOT NULL,
    ADD CONSTRAINT cards_series_code_fkey
        FOREIGN KEY (series_code) REFERENCES public.agencies(code) ON DELETE RESTRICT,
    ADD CONSTRAINT cards_submission_kind_check
        CHECK (submission_kind IN ('guest', 'legacy'));

CREATE INDEX cards_series_code_idx
    ON public.cards(series_code, id DESC)
    WHERE series_code IS NOT NULL;

CREATE TABLE public.namecard_idols (
    card_id BIGINT NOT NULL,
    idol_id BIGINT NOT NULL,
    display_order INTEGER NOT NULL,
    CONSTRAINT namecard_idols_pkey PRIMARY KEY (card_id, idol_id),
    CONSTRAINT namecard_idols_card_order_key UNIQUE (card_id, display_order),
    CONSTRAINT namecard_idols_display_order_check CHECK (display_order >= 0),
    CONSTRAINT namecard_idols_card_id_fkey
        FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE,
    CONSTRAINT namecard_idols_idol_id_fkey
        FOREIGN KEY (idol_id) REFERENCES public.idols(id) ON DELETE RESTRICT
);

CREATE INDEX namecard_idols_idol_id_idx
    ON public.namecard_idols(idol_id, card_id);

ALTER TABLE public.fudaba_cards
    ADD COLUMN legacy_card_id BIGINT,
    DROP CONSTRAINT fudaba_cards_favorite_idol_check,
    DROP CONSTRAINT fudaba_cards_publication_status_check,
    ADD CONSTRAINT fudaba_cards_favorite_idol_check
        CHECK (length(favorite_idol) <= 1000),
    ADD CONSTRAINT fudaba_cards_publication_status_check CHECK (
        publication_status IN (
            'draft', 'pending', 'approving', 'published', 'hidden', 'rejected'
        )
    ),
    ADD CONSTRAINT fudaba_cards_legacy_card_id_key UNIQUE (legacy_card_id),
    ADD CONSTRAINT fudaba_cards_legacy_card_id_fkey
        FOREIGN KEY (legacy_card_id) REFERENCES public.cards(id) ON DELETE RESTRICT;

CREATE TABLE public.fudaba_card_idols (
    card_id TEXT NOT NULL,
    idol_id BIGINT NOT NULL,
    display_order INTEGER NOT NULL,
    CONSTRAINT fudaba_card_idols_pkey PRIMARY KEY (card_id, idol_id),
    CONSTRAINT fudaba_card_idols_card_order_key UNIQUE (card_id, display_order),
    CONSTRAINT fudaba_card_idols_display_order_check CHECK (display_order >= 0),
    CONSTRAINT fudaba_card_idols_card_id_fkey
        FOREIGN KEY (card_id) REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    CONSTRAINT fudaba_card_idols_idol_id_fkey
        FOREIGN KEY (idol_id) REFERENCES public.idols(id) ON DELETE RESTRICT
);

CREATE INDEX fudaba_card_idols_idol_id_idx
    ON public.fudaba_card_idols(idol_id, card_id);

CREATE TABLE public.fudaba_card_claims (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    legacy_card_id BIGINT NOT NULL,
    claimant_account_id TEXT NOT NULL,
    target_card_id TEXT,
    series_code TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    message TEXT NOT NULL DEFAULT '' CHECK (length(message) <= 2000),
    review_note TEXT NOT NULL DEFAULT '' CHECK (length(review_note) <= 2000),
    reviewed_by BIGINT,
    reviewed_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fudaba_card_claims_legacy_card_id_fkey
        FOREIGN KEY (legacy_card_id) REFERENCES public.cards(id) ON DELETE RESTRICT,
    CONSTRAINT fudaba_card_claims_claimant_account_id_fkey
        FOREIGN KEY (claimant_account_id)
        REFERENCES public.platform_accounts(id) ON DELETE RESTRICT,
    CONSTRAINT fudaba_card_claims_target_card_id_fkey
        FOREIGN KEY (target_card_id) REFERENCES public.fudaba_cards(id) ON DELETE RESTRICT,
    CONSTRAINT fudaba_card_claims_series_code_fkey
        FOREIGN KEY (series_code) REFERENCES public.agencies(code) ON DELETE RESTRICT,
    CONSTRAINT fudaba_card_claims_reviewed_by_fkey
        FOREIGN KEY (reviewed_by)
        REFERENCES public.backoffice_accounts(id) ON DELETE RESTRICT,
    CONSTRAINT fudaba_card_claims_state_check CHECK (
        state IN ('pending', 'approving', 'approved', 'rejected', 'cancelled')
    ),
    CONSTRAINT fudaba_card_claims_updated_at_check CHECK (updated_at >= created_at),
    CONSTRAINT fudaba_card_claims_review_check CHECK (
        (
            state IN ('approved', 'rejected')
            AND reviewed_by IS NOT NULL
            AND reviewed_at IS NOT NULL
            AND reviewed_at >= created_at
        ) OR (
            state NOT IN ('approved', 'rejected')
            AND reviewed_at IS NULL
        )
    ),
    CONSTRAINT fudaba_card_claims_approved_target_check CHECK (
        state <> 'approved' OR target_card_id IS NOT NULL
    )
);

CREATE UNIQUE INDEX fudaba_card_claims_one_open_or_approved_legacy_idx
    ON public.fudaba_card_claims(legacy_card_id)
    WHERE state IN ('pending', 'approving', 'approved');
CREATE INDEX fudaba_card_claims_claimant_idx
    ON public.fudaba_card_claims(claimant_account_id, created_at DESC, id DESC);
CREATE INDEX fudaba_card_claims_review_queue_idx
    ON public.fudaba_card_claims(state, created_at ASC, id ASC)
    WHERE state IN ('pending', 'approving');
CREATE INDEX fudaba_card_claims_target_card_idx
    ON public.fudaba_card_claims(target_card_id)
    WHERE target_card_id IS NOT NULL;

CREATE TABLE public.fudaba_card_claim_idols (
    claim_id TEXT NOT NULL,
    idol_id BIGINT NOT NULL,
    display_order INTEGER NOT NULL,
    CONSTRAINT fudaba_card_claim_idols_pkey PRIMARY KEY (claim_id, idol_id),
    CONSTRAINT fudaba_card_claim_idols_claim_order_key UNIQUE (claim_id, display_order),
    CONSTRAINT fudaba_card_claim_idols_display_order_check CHECK (display_order >= 0),
    CONSTRAINT fudaba_card_claim_idols_claim_id_fkey
        FOREIGN KEY (claim_id) REFERENCES public.fudaba_card_claims(id) ON DELETE CASCADE,
    CONSTRAINT fudaba_card_claim_idols_idol_id_fkey
        FOREIGN KEY (idol_id) REFERENCES public.idols(id) ON DELETE RESTRICT
);

CREATE INDEX fudaba_card_claim_idols_idol_id_idx
    ON public.fudaba_card_claim_idols(idol_id, claim_id);

CREATE TABLE public.fudaba_claim_envelopes (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    recipient_account_id TEXT NOT NULL,
    legacy_card_id BIGINT NOT NULL,
    kind TEXT NOT NULL,
    action_state TEXT NOT NULL DEFAULT 'pending',
    claim_id TEXT,
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    body TEXT NOT NULL CHECK (length(body) <= 4000),
    read_at TIMESTAMPTZ,
    actioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    CONSTRAINT fudaba_claim_envelopes_recipient_account_id_fkey
        FOREIGN KEY (recipient_account_id)
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fudaba_claim_envelopes_legacy_card_id_fkey
        FOREIGN KEY (legacy_card_id) REFERENCES public.cards(id) ON DELETE RESTRICT,
    CONSTRAINT fudaba_claim_envelopes_claim_id_fkey
        FOREIGN KEY (claim_id) REFERENCES public.fudaba_card_claims(id) ON DELETE SET NULL,
    CONSTRAINT fudaba_claim_envelopes_kind_check CHECK (
        kind IN ('legacy-card-match', 'claim-approved', 'claim-rejected')
    ),
    CONSTRAINT fudaba_claim_envelopes_action_state_check CHECK (
        action_state IN ('pending', 'confirmed', 'declined', 'none')
    ),
    CONSTRAINT fudaba_claim_envelopes_kind_action_check CHECK (
        (
            kind = 'legacy-card-match'
            AND action_state IN ('pending', 'confirmed', 'declined')
        ) OR (
            kind IN ('claim-approved', 'claim-rejected')
            AND action_state = 'none'
        )
    ),
    CONSTRAINT fudaba_claim_envelopes_action_time_check CHECK (
        (action_state IN ('confirmed', 'declined')) = (actioned_at IS NOT NULL)
    ),
    CONSTRAINT fudaba_claim_envelopes_claim_action_check CHECK (
        claim_id IS NULL OR action_state IN ('confirmed', 'none')
    ),
    CONSTRAINT fudaba_claim_envelopes_read_at_check CHECK (
        read_at IS NULL OR read_at >= created_at
    ),
    CONSTRAINT fudaba_claim_envelopes_actioned_at_check CHECK (
        actioned_at IS NULL OR actioned_at >= created_at
    ),
    CONSTRAINT fudaba_claim_envelopes_recipient_kind_legacy_key
        UNIQUE (recipient_account_id, kind, legacy_card_id)
);

CREATE INDEX fudaba_claim_envelopes_recipient_created_idx
    ON public.fudaba_claim_envelopes(recipient_account_id, created_at DESC, id DESC);
CREATE INDEX fudaba_claim_envelopes_recipient_unread_idx
    ON public.fudaba_claim_envelopes(recipient_account_id, created_at DESC, id DESC)
    WHERE read_at IS NULL;
CREATE INDEX fudaba_claim_envelopes_claim_id_idx
    ON public.fudaba_claim_envelopes(claim_id)
    WHERE claim_id IS NOT NULL;
