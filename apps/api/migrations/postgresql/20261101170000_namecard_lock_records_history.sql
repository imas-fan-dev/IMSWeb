-- ims:migration-phase: pre-data
-- Audit trail: a lock and its release are both events, so the table keeps one
-- row per action instead of a single row per card.

ALTER TABLE public.namecard_lock_records RENAME COLUMN locked_at TO occurred_at;

ALTER TABLE public.namecard_lock_records
    ADD COLUMN action text NOT NULL DEFAULT 'locked';

ALTER TABLE public.namecard_lock_records
    ADD CONSTRAINT namecard_lock_records_action_check
    CHECK (action IN ('locked', 'unlocked'));

ALTER TABLE public.namecard_lock_records
    ALTER COLUMN reason DROP NOT NULL;

ALTER TABLE public.namecard_lock_records
    DROP CONSTRAINT namecard_lock_records_reason_check;

ALTER TABLE public.namecard_lock_records
    ADD CONSTRAINT namecard_lock_records_reason_check
    CHECK (reason IS NULL OR (length(btrim(reason)) >= 1 AND length(btrim(reason)) <= 400));

DROP INDEX IF EXISTS public.namecard_lock_records_locked_at_idx;

CREATE INDEX IF NOT EXISTS namecard_lock_records_occurred_at_idx
    ON public.namecard_lock_records (occurred_at DESC);
