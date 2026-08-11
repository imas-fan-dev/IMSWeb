-- ims:migration-phase: post-data

ALTER TABLE public.cards
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS withdrawal_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

UPDATE public.cards
SET status = CASE
        WHEN status = 'deleted' THEN 'withdrawn'
        WHEN status IS NULL THEN 'pending'
        WHEN status NOT IN ('pending', 'approving', 'approved', 'rejected', 'withdrawn')
            THEN 'rejected'
        ELSE status
    END,
    withdrawn_at = CASE
        WHEN status = 'deleted' THEN COALESCE(withdrawn_at, CURRENT_TIMESTAMP)
        ELSE withdrawn_at
    END;

ALTER TABLE public.cards ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_status_check;
ALTER TABLE public.cards ADD CONSTRAINT cards_status_check
    CHECK (status IN ('pending', 'approving', 'approved', 'rejected', 'withdrawn'));

CREATE INDEX IF NOT EXISTS cards_withdrawal_token_idx
    ON public.cards (id, withdrawal_token_hash)
    WHERE withdrawal_token_hash IS NOT NULL;

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS operation_key TEXT,
    ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS publication_state TEXT NOT NULL DEFAULT 'ready';

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_publication_state_check;
ALTER TABLE public.events ADD CONSTRAINT events_publication_state_check
    CHECK (publication_state IN ('publishing', 'ready'));

CREATE UNIQUE INDEX IF NOT EXISTS events_operation_key_unique
    ON public.events (operation_key)
    WHERE operation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_publication_state_id_idx
    ON public.events (publication_state, id DESC);
