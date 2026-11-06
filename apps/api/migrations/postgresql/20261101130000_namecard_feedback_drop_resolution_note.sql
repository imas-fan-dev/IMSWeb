-- ims:migration-phase: post-data

-- The reporter always receives the same template, so the operator no longer
-- writes a note. The audit trail keeps the decision itself.

ALTER TABLE public.namecard_feedback
    DROP CONSTRAINT IF EXISTS namecard_feedback_note_check;

ALTER TABLE public.namecard_feedback
    DROP COLUMN IF EXISTS resolution_note;
