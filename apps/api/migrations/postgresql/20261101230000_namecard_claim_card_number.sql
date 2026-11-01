-- ims:migration-phase: post-data

-- Guest uploads live in fudaba_cards and only the imported wall has rows in
-- cards, so a claim's legacy id is a wall card number, not a cards(id) key.
ALTER TABLE public.fudaba_card_claims
    DROP CONSTRAINT IF EXISTS fudaba_card_claims_legacy_card_id_fkey;

ALTER TABLE public.fudaba_card_merges
    DROP CONSTRAINT IF EXISTS fudaba_card_merges_legacy_card_id_fkey;

COMMENT ON COLUMN public.fudaba_card_claims.legacy_card_id IS
    'Wall card number (fudaba_cards.card_number) this claim targets.';
