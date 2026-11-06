-- ims:migration-phase: post-data

-- One served card can absorb any number of guest uploads, so the linkage
-- lives in its own table instead of fudaba_cards.legacy_card_id (which is
-- single-valued and unique).
CREATE TABLE IF NOT EXISTS public.fudaba_card_merges (
    claim_id TEXT NOT NULL,
    target_card_id TEXT NOT NULL,
    legacy_card_id BIGINT NOT NULL,
    merged_at TEXT NOT NULL,
    CONSTRAINT fudaba_card_merges_pkey PRIMARY KEY (claim_id),
    CONSTRAINT fudaba_card_merges_legacy_card_id_key UNIQUE (legacy_card_id),
    CONSTRAINT fudaba_card_merges_claim_id_fkey
        FOREIGN KEY (claim_id) REFERENCES public.fudaba_card_claims(id)
        ON DELETE CASCADE,
    CONSTRAINT fudaba_card_merges_target_card_id_fkey
        FOREIGN KEY (target_card_id) REFERENCES public.fudaba_cards(id)
        ON DELETE CASCADE,
    CONSTRAINT fudaba_card_merges_legacy_card_id_fkey
        FOREIGN KEY (legacy_card_id) REFERENCES public.cards(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS fudaba_card_merges_target_idx
    ON public.fudaba_card_merges (target_card_id);

-- Approved binding claims already merged before this table existed.
INSERT INTO public.fudaba_card_merges (
    claim_id, target_card_id, legacy_card_id, merged_at
)
SELECT
    claim.id,
    claim.target_card_id,
    claim.legacy_card_id,
    COALESCE(claim.reviewed_at, claim.updated_at)
FROM public.fudaba_card_claims claim
WHERE claim.state = 'approved'
  AND claim.target_card_id IS NOT NULL
ON CONFLICT DO NOTHING;
