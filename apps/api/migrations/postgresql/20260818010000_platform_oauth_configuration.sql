-- ims:migration-phase: post-data

ALTER TABLE public.platform_oauth_providers
    ADD COLUMN client_id_ciphertext TEXT
        CHECK (client_id_ciphertext IS NULL OR length(client_id_ciphertext) <= 4096);
ALTER TABLE public.platform_oauth_providers
    ADD COLUMN client_secret_ciphertext TEXT
        CHECK (client_secret_ciphertext IS NULL OR length(client_secret_ciphertext) <= 8192);
ALTER TABLE public.platform_oauth_providers
    ADD COLUMN redirect_uri TEXT
        CHECK (redirect_uri IS NULL OR length(redirect_uri) BETWEEN 1 AND 2048);
ALTER TABLE public.platform_oauth_providers
    ADD COLUMN updated_at BIGINT NOT NULL DEFAULT 0
        CHECK (updated_at >= 0);
