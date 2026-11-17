-- ims:migration-phase: post-data

-- Published cards keep serving their approved content while a newer revision is
-- under review, so the reviewable copy lives in its own column set: the live
-- columns stay untouched (wall, exchange and claims keep reading them) and the
-- submitted revision waits in `pending_*` until a reviewer decides.
ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS review_status TEXT;

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS review_reason TEXT;

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS review_submitted_at TIMESTAMPTZ;

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS pending_payload JSONB;

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS pending_front_object_key TEXT;

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS pending_back_object_key TEXT;

-- `locked` is a version-level verdict: the submission was rejected because it
-- violates the rules. It leaves the published version online, unlike the
-- card-level `publication_status = 'locked'` which takes the whole card down.
ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_review_status_check;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_review_status_check CHECK (
        review_status IS NULL
        OR review_status IN ('pending', 'rejected', 'locked')
    );

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_review_reason_check;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_review_reason_check CHECK (
        review_reason IS NULL
        OR length(btrim(review_reason)) BETWEEN 1 AND 400
    );

-- A verdict without a stored submission would lose the content the verdict is
-- about, so the payload is mandatory whenever a review is on record.
ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_pending_payload_check;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_pending_payload_check CHECK (
        review_status IS NULL
        OR (
            pending_payload IS NOT NULL
            AND jsonb_typeof(pending_payload) = 'object'
        )
    );

CREATE INDEX IF NOT EXISTS fudaba_cards_review_pending_idx
    ON public.fudaba_cards (review_submitted_at)
    WHERE review_status = 'pending';
