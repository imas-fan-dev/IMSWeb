-- ims:migration-phase: post-data

CREATE TABLE public.platform_email_request_cooldowns (
    purpose TEXT NOT NULL,
    recipient_key TEXT NOT NULL,
    enqueued_at BIGINT NOT NULL,
    resend_after BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    CONSTRAINT platform_email_request_cooldowns_pkey PRIMARY KEY (
        purpose,
        recipient_key
    ),
    CONSTRAINT platform_email_request_cooldowns_purpose_ck CHECK (
        purpose IN ('registration', 'password_reset')
    ),
    CONSTRAINT platform_email_request_cooldowns_recipient_key_ck CHECK (
        recipient_key ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT platform_email_request_cooldowns_enqueued_at_ck CHECK (
        enqueued_at >= 0
    ),
    CONSTRAINT platform_email_request_cooldowns_window_ck CHECK (
        resend_after >= enqueued_at
        AND resend_after <= enqueued_at + 600000
    ),
    CONSTRAINT platform_email_request_cooldowns_updated_at_ck CHECK (
        updated_at >= enqueued_at
    )
);

CREATE INDEX platform_email_request_cooldowns_expiry_idx
    ON public.platform_email_request_cooldowns (
        resend_after,
        purpose,
        recipient_key
    );
