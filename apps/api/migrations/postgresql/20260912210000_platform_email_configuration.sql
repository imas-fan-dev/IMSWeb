-- ims:migration-phase: post-data

CREATE TABLE public.platform_email_configuration (
    singleton_id SMALLINT PRIMARY KEY DEFAULT 1
        CHECK (singleton_id = 1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    host TEXT NOT NULL DEFAULT ''
        CHECK (length(host) <= 253),
    port INTEGER NOT NULL DEFAULT 465
        CHECK (port BETWEEN 1 AND 65535),
    security TEXT NOT NULL DEFAULT 'tls'
        CHECK (security IN ('tls', 'starttls')),
    username_ciphertext TEXT
        CHECK (username_ciphertext IS NULL OR length(username_ciphertext) <= 4096),
    password_ciphertext TEXT
        CHECK (password_ciphertext IS NULL OR length(password_ciphertext) <= 8192),
    from_address TEXT NOT NULL DEFAULT ''
        CHECK (length(from_address) <= 320),
    from_name TEXT NOT NULL DEFAULT 'IMSWeb'
        CHECK (length(from_name) BETWEEN 1 AND 100),
    updated_at BIGINT NOT NULL DEFAULT 0
        CHECK (updated_at >= 0),
    CHECK (
        NOT enabled OR (
            length(host) > 0
            AND username_ciphertext IS NOT NULL
            AND password_ciphertext IS NOT NULL
            AND length(from_address) > 0
        )
    )
);

INSERT INTO public.platform_email_configuration (singleton_id)
VALUES (1);
