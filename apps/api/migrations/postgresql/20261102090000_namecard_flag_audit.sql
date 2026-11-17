-- ims:migration-phase: post-data

-- Flagging a submission is a moderation verdict, so it belongs in the same
-- trail as locking and unlocking.
ALTER TABLE public.namecard_lock_records
    DROP CONSTRAINT IF EXISTS namecard_lock_records_action_check;

ALTER TABLE public.namecard_lock_records
    ADD CONSTRAINT namecard_lock_records_action_check
    CHECK (action IN ('locked', 'unlocked', 'flagged'));
