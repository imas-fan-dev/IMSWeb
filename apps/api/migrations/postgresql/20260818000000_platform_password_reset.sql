-- ims:migration-phase: post-data

CREATE TABLE public.platform_password_reset_codes (
    normalized_email TEXT PRIMARY KEY
        REFERENCES public.platform_email_credentials(normalized_email)
        ON DELETE CASCADE,
    code_hash TEXT NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
    expires_at BIGINT NOT NULL CHECK (expires_at >= 0),
    resend_after BIGINT NOT NULL CHECK (resend_after >= 0),
    attempts_remaining INTEGER NOT NULL CHECK (attempts_remaining BETWEEN 0 AND 5),
    consumed_at BIGINT,
    created_at BIGINT NOT NULL CHECK (created_at >= 0),
    updated_at BIGINT NOT NULL CHECK (updated_at >= created_at),
    pending_token TEXT,
    pending_code_hash TEXT,
    pending_expires_at BIGINT,
    pending_resend_after BIGINT,
    pending_attempts_remaining INTEGER,
    pending_created_at BIGINT,
    delivery_token TEXT,
    CHECK (expires_at > created_at),
    CHECK (resend_after >= created_at AND resend_after <= expires_at),
    CHECK (consumed_at IS NULL OR consumed_at >= created_at),
    CHECK (
        delivery_token IS NULL OR (
            delivery_token ~ '^[a-f0-9]{64}$' AND pending_token IS NULL
        )
    ),
    CHECK (
        (
            pending_token IS NULL AND pending_code_hash IS NULL
            AND pending_expires_at IS NULL AND pending_resend_after IS NULL
            AND pending_attempts_remaining IS NULL AND pending_created_at IS NULL
        ) OR (
            pending_token ~ '^[a-f0-9]{64}$'
            AND pending_code_hash ~ '^[a-f0-9]{64}$'
            AND pending_expires_at > pending_created_at
            AND pending_resend_after BETWEEN pending_created_at AND pending_expires_at
            AND pending_attempts_remaining BETWEEN 0 AND 5
            AND pending_created_at >= 0 AND delivery_token IS NULL
        )
    )
);

CREATE INDEX platform_password_reset_expiry_idx
    ON public.platform_password_reset_codes(expires_at);
CREATE INDEX platform_password_reset_account_idx
    ON public.platform_password_reset_codes(normalized_email);
