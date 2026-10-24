-- ims:migration-phase: post-data

ALTER TABLE public.platform_email_configuration
    ADD COLUMN resend_cooldown_seconds INTEGER NOT NULL DEFAULT 60,
    ADD CONSTRAINT platform_email_configuration_resend_cooldown_ck CHECK (
        resend_cooldown_seconds BETWEEN 30 AND 600
    );

-- A failed resend can outlive the previously active code. Keep its enqueue-time
-- cooldown without extending that older code's delivery-based expiry.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.platform_email_verification_codes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%resend_after <= expires_at%'
      AND pg_get_constraintdef(oid) NOT LIKE '%pending_resend_after%'
    LIMIT 1;
    IF constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE public.platform_email_verification_codes DROP CONSTRAINT %I',
            constraint_name
        );
    END IF;
END $$;

ALTER TABLE public.platform_email_verification_codes
    ADD CONSTRAINT platform_email_verification_resend_after_ck CHECK (
        resend_after >= created_at
    );

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.platform_password_reset_codes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%resend_after <= expires_at%'
      AND pg_get_constraintdef(oid) NOT LIKE '%pending_resend_after%'
    LIMIT 1;
    IF constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE public.platform_password_reset_codes DROP CONSTRAINT %I',
            constraint_name
        );
    END IF;
END $$;

ALTER TABLE public.platform_password_reset_codes
    ADD CONSTRAINT platform_password_reset_resend_after_ck CHECK (
        resend_after >= created_at
    );

CREATE TABLE public.platform_email_delivery_jobs (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
    purpose TEXT NOT NULL CHECK (
        purpose IN ('registration', 'password_reset')
    ),
    delivery_token TEXT NOT NULL UNIQUE CHECK (
        delivery_token ~ '^[a-f0-9]{64}$'
    ),
    payload_ciphertext TEXT NOT NULL CHECK (
        length(payload_ciphertext) BETWEEN 1 AND 16384
    ),
    payload_version INTEGER NOT NULL CHECK (payload_version = 1),
    state TEXT NOT NULL DEFAULT 'queued' CHECK (
        state IN (
            'queued', 'running', 'retry_wait', 'completed', 'failed',
            'superseded'
        )
    ),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 2),
    next_attempt_at BIGINT NOT NULL CHECK (next_attempt_at >= 0),
    deadline_at BIGINT NOT NULL CHECK (deadline_at >= next_attempt_at),
    lease_token TEXT CHECK (
        lease_token IS NULL OR lease_token ~ '^[a-f0-9]{64}$'
    ),
    lease_expires_at BIGINT,
    failure_category TEXT CHECK (
        failure_category IS NULL OR failure_category IN (
            'configuration', 'credentials', 'dns', 'dns_policy', 'tls',
            'authentication', 'smtp_transient', 'smtp_permanent', 'network',
            'envelope', 'recipient_rejected', 'deadline', 'payload', 'unknown'
        )
    ),
    acceptance_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
    last_attempt_at BIGINT,
    accepted_at BIGINT,
    completed_at BIGINT,
    failed_at BIGINT,
    created_at BIGINT NOT NULL CHECK (created_at >= 0),
    updated_at BIGINT NOT NULL CHECK (updated_at >= created_at),
    CHECK (deadline_at > created_at),
    CHECK (
        (state = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (state <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL)
    ),
    CHECK (last_attempt_at IS NULL OR last_attempt_at >= created_at),
    CHECK (accepted_at IS NULL OR accepted_at >= created_at),
    CHECK (completed_at IS NULL OR completed_at >= created_at),
    CHECK (failed_at IS NULL OR failed_at >= created_at),
    CHECK (
        (state = 'completed' AND accepted_at IS NOT NULL AND completed_at IS NOT NULL)
        OR (state <> 'completed' AND completed_at IS NULL)
    ),
    CHECK (
        (state = 'failed' AND failed_at IS NOT NULL AND failure_category IS NOT NULL)
        OR (state <> 'failed' AND failed_at IS NULL)
    )
);

CREATE INDEX platform_email_delivery_jobs_claim_idx
    ON public.platform_email_delivery_jobs (
        next_attempt_at,
        attempts,
        created_at,
        id
    )
    WHERE state IN ('queued', 'retry_wait');

CREATE INDEX platform_email_delivery_jobs_expired_lease_idx
    ON public.platform_email_delivery_jobs (
        lease_expires_at,
        deadline_at,
        id
    )
    WHERE state = 'running';

CREATE INDEX platform_email_delivery_jobs_deadline_idx
    ON public.platform_email_delivery_jobs (
        deadline_at,
        id
    )
    WHERE state IN ('queued', 'running', 'retry_wait');

CREATE INDEX platform_email_delivery_jobs_terminal_retention_idx
    ON public.platform_email_delivery_jobs (
        updated_at,
        id
    )
    WHERE state IN ('completed', 'failed', 'superseded');
