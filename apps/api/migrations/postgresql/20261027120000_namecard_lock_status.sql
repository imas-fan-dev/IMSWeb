-- ims:migration-phase: post-data

-- Backoffice moderation no longer deletes cards: it locks them so a reviewer can
-- revisit the decision. `hidden` is now the state a card reaches when its owner
-- deletes it, which keeps the row (and its media) visible to the backoffice.

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT fudaba_cards_publication_status_check;
ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_publication_status_check
        CHECK (publication_status IN (
            'draft', 'pending', 'approving', 'published',
            'hidden', 'rejected', 'withdrawn', 'locked'
        ));

-- The reviewer's justification for a lock. Cleared when the card is unlocked.
ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS lock_reason TEXT;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_lock_reason_check
        CHECK (lock_reason IS NULL OR length(btrim(lock_reason)) BETWEEN 1 AND 400);

ALTER TABLE public.namecard_notifications
    DROP CONSTRAINT namecard_notifications_kind_check;
ALTER TABLE public.namecard_notifications
    ADD CONSTRAINT namecard_notifications_kind_check
        CHECK (kind IN (
            'card-approved', 'card-rejected', 'claim-approved', 'claim-rejected',
            'station-message', 'card-locked', 'card-unlocked'
        ));

CREATE INDEX fudaba_cards_locked_idx
    ON public.fudaba_cards(publication_status)
    WHERE publication_status = 'locked';
