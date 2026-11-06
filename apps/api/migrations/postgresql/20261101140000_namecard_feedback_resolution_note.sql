-- ims:migration-phase: post-data

-- A rejection quotes its reason back to the reporter, so the decision keeps it.
ALTER TABLE public.namecard_feedback
    ADD COLUMN IF NOT EXISTS resolution_note TEXT;

ALTER TABLE public.namecard_feedback
    DROP CONSTRAINT IF EXISTS namecard_feedback_resolution_note_check;

ALTER TABLE public.namecard_feedback
    ADD CONSTRAINT namecard_feedback_resolution_note_check
    CHECK (
        resolution_note IS NULL
        OR char_length(btrim(resolution_note)) BETWEEN 1 AND 400
    );
