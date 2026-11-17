-- ims:migration-phase: post-data

-- app 内 OAuth 登录需要把会话交回 WebView：provider 只看到我们既有的 HTTPS
-- 回调，回调之后由服务端签发一次性授权码，再用自定义 scheme 唤起 app，app 拿
-- 码 + 本地 code_verifier 换会话。一次性码落 PostgreSQL 而不是 Valkey：缓存
-- 端口只有 get/set/delete，先读后删存在并发重放窗口，而这里可以用
-- DELETE ... RETURNING 在单条语句内完成校验与消费。
CREATE TABLE public.platform_oauth_exchange_codes (
    code_hash TEXT PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
    account_id TEXT NOT NULL
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    code_challenge TEXT NOT NULL CHECK (length(code_challenge) = 43),
    expires_at BIGINT NOT NULL CHECK (expires_at >= 0),
    created_at BIGINT NOT NULL CHECK (created_at >= 0),
    CONSTRAINT platform_oauth_exchange_codes_window_ck CHECK (expires_at > created_at)
);

CREATE INDEX platform_oauth_exchange_codes_expiry_idx
    ON public.platform_oauth_exchange_codes(expires_at);

CREATE INDEX platform_oauth_exchange_codes_account_idx
    ON public.platform_oauth_exchange_codes(account_id);

-- 发起方是与 intent（login / link）正交的维度：intent 的 CHECK 与
-- linking_account_id 绑定，绑定流程要用 link 分支，web / app 不能塞进 intent。
-- 两列都带默认值或可空，既有 state 行自动落为 web + NULL。
-- 列内联 CHECK 会被 PostgreSQL 自动命名为 platform_oauth_states_client_target_check，
-- 与下面组合约束的名字冲突，所以这里显式给值域约束换名。
ALTER TABLE public.platform_oauth_states
    ADD COLUMN client_target TEXT NOT NULL DEFAULT 'web'
        CONSTRAINT platform_oauth_states_client_target_values_check
            CHECK (client_target IN ('web', 'app'));
ALTER TABLE public.platform_oauth_states
    ADD COLUMN app_code_challenge TEXT
        CHECK (app_code_challenge IS NULL OR length(app_code_challenge) = 43);
ALTER TABLE public.platform_oauth_states
    ADD CONSTRAINT platform_oauth_states_client_target_check
        CHECK ((client_target = 'app') = (app_code_challenge IS NOT NULL));
