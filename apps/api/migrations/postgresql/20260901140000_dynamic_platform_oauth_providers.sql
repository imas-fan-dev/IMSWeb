-- ims:migration-phase: post-data

ALTER TABLE public.platform_oauth_providers
    ADD COLUMN icon TEXT NOT NULL DEFAULT 'globe-2'
        CHECK (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(icon) <= 64),
    ADD COLUMN button_color TEXT NOT NULL DEFAULT '#111827'
        CHECK (button_color ~ '^#[0-9a-f]{6}$'),
    ADD COLUMN authorization_endpoint TEXT NOT NULL
        DEFAULT 'https://invalid.example/oauth/authorize'
        CHECK (length(authorization_endpoint) BETWEEN 1 AND 2048),
    ADD COLUMN token_endpoint TEXT NOT NULL
        DEFAULT 'https://invalid.example/oauth/token'
        CHECK (length(token_endpoint) BETWEEN 1 AND 2048),
    ADD COLUMN user_info_endpoint TEXT NOT NULL
        DEFAULT 'https://invalid.example/oauth/userinfo'
        CHECK (length(user_info_endpoint) BETWEEN 1 AND 2048),
    ADD COLUMN scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(scopes_json) = 'array'),
    ADD COLUMN token_auth_method TEXT NOT NULL DEFAULT 'client_secret_post'
        CHECK (token_auth_method IN ('client_secret_post', 'client_secret_basic')),
    ADD COLUMN pkce_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN profile_subject_path TEXT NOT NULL DEFAULT 'id'
        CHECK (profile_subject_path ~ '^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)*$'),
    ADD COLUMN profile_display_name_path TEXT NOT NULL DEFAULT 'name'
        CHECK (profile_display_name_path ~ '^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)*$'),
    ADD COLUMN profile_display_name_fallback_path TEXT
        CHECK (
            profile_display_name_fallback_path IS NULL
            OR profile_display_name_fallback_path ~ '^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)*$'
        ),
    ADD COLUMN profile_avatar_url_path TEXT
        CHECK (
            profile_avatar_url_path IS NULL
            OR profile_avatar_url_path ~ '^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)*$'
        ),
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 100
        CHECK (sort_order >= 0);

UPDATE public.platform_oauth_providers
SET icon = 'google',
    button_color = '#ffffff',
    authorization_endpoint = 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint = 'https://oauth2.googleapis.com/token',
    user_info_endpoint = 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes_json = '["openid", "email", "profile"]'::jsonb,
    token_auth_method = 'client_secret_post',
    pkce_enabled = TRUE,
    profile_subject_path = 'sub',
    profile_display_name_path = 'name',
    profile_display_name_fallback_path = 'email',
    profile_avatar_url_path = 'picture',
    sort_order = 10
WHERE code = 'google';

UPDATE public.platform_oauth_providers
SET icon = 'github',
    button_color = '#24292f',
    authorization_endpoint = 'https://github.com/login/oauth/authorize',
    token_endpoint = 'https://github.com/login/oauth/access_token',
    user_info_endpoint = 'https://api.github.com/user',
    scopes_json = '[]'::jsonb,
    token_auth_method = 'client_secret_post',
    pkce_enabled = TRUE,
    profile_subject_path = 'id',
    profile_display_name_path = 'name',
    profile_display_name_fallback_path = 'login',
    profile_avatar_url_path = 'avatar_url',
    sort_order = 20
WHERE code = 'github';

CREATE INDEX platform_oauth_providers_sort_idx
    ON public.platform_oauth_providers(sort_order, code);
