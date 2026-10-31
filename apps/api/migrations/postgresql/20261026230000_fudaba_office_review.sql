-- ims:migration-phase: post-data

-- Review the complete office at its canonical owner-supplied coordinates.
-- Existing location approvals do not establish approval of the whole office.
ALTER TABLE public.fudaba_offices
    ADD COLUMN review_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_state IN ('pending', 'published', 'rejected')),
    ADD COLUMN review_submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD COLUMN reviewed_by BIGINT REFERENCES public.backoffice_accounts(id) ON DELETE RESTRICT,
    ADD COLUMN review_note TEXT NOT NULL DEFAULT '',
    ADD COLUMN review_operation_id TEXT,
    ADD COLUMN review_audit_id TEXT,
    ADD CONSTRAINT fudaba_office_review_metadata_check CHECK (
        (review_state = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
        OR (review_state IN ('published', 'rejected') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    );

CREATE INDEX fudaba_offices_review_queue_idx
    ON public.fudaba_offices (review_state, review_submitted_at, id);
CREATE INDEX fudaba_offices_exact_public_idx
    ON public.fudaba_offices (latitude, longitude, id)
    WHERE status = 'active' AND review_state = 'published';

-- Keep the legacy location rows and audit trail for history only. Runtime
-- publication no longer reads them, and no legacy grid is converted to a pin.
