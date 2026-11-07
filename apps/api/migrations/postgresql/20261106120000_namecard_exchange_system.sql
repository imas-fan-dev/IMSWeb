-- ims:migration-phase: pre-data
-- 名片册与交换（docs/architecture/namecard-exchange.md）。
--
-- 交换只把「名片副本」放进对方的名片册：`fudaba_cards.owner_account_id`
-- 从不改写，原卡改动后名片册里同步可见，名片册里留存的 `snapshot` 只在
-- 原卡被删除（`card_id` 置空）后兜底显示。
--
-- 旧的办公室交换申请（`fudaba_exchange_requests`）从未上线，本轮由本文件
-- 删除，连同两张叶子守卫一起收掉。

CREATE TABLE IF NOT EXISTS public.namecard_exchanges (
    id UUID PRIMARY KEY,
    -- 客户端的幂等锚点：重试同一次提交只会落一行。
    client_exchange_id TEXT NOT NULL UNIQUE
        CHECK (length(btrim(client_exchange_id)) BETWEEN 8 AND 64),
    source TEXT NOT NULL CHECK (
        source IN ('card-share', 'card-request', 'quick', 'scan')
    ),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'completed', 'declined', 'expired')
    ),
    initiator_account_id TEXT NOT NULL
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    target_account_id TEXT NOT NULL
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    -- 目标方要让出的名片编号；扫码时来自会话，其余来自入口。
    target_card_numbers BIGINT[] NOT NULL DEFAULT '{}',
    -- 发起方交出的名片编号，可以为空（对方没有可交换的）。
    initiator_card_numbers BIGINT[] NOT NULL DEFAULT '{}',
    -- 被跳过的名片与原因，成功响应原样带回给前端。
    skipped JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    CONSTRAINT namecard_exchanges_distinct_accounts
        CHECK (initiator_account_id <> target_account_id),
    CONSTRAINT namecard_exchanges_target_limit
        CHECK (cardinality(target_card_numbers) <= 20),
    CONSTRAINT namecard_exchanges_initiator_limit
        CHECK (cardinality(initiator_card_numbers) <= 20),
    CONSTRAINT namecard_exchanges_skipped_array
        CHECK (jsonb_typeof(skipped) = 'array'),
    CONSTRAINT namecard_exchanges_resolution
        CHECK ((status = 'pending') = (resolved_at IS NULL))
);

CREATE INDEX IF NOT EXISTS namecard_exchanges_initiator_idx
    ON public.namecard_exchanges(initiator_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS namecard_exchanges_target_idx
    ON public.namecard_exchanges(target_account_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.namecard_collection_entries (
    id UUID PRIMARY KEY,
    collector_account_id TEXT NOT NULL
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    -- 原卡的编号在行生命周期内不变，即使卡片被删除也保留展示身份。
    card_number BIGINT NOT NULL CHECK (card_number > 0),
    -- 原卡被删除后置空，`snapshot` 接手展示。
    card_id TEXT REFERENCES public.fudaba_cards(id) ON DELETE SET NULL,
    exchange_id UUID NOT NULL
        REFERENCES public.namecard_exchanges(id) ON DELETE CASCADE,
    obtained_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- 用户从名片册隐藏，而不是删除：再抽到同一张时恢复显示。
    hidden_at TIMESTAMPTZ,
    snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT namecard_collection_entries_once
        UNIQUE (collector_account_id, card_number),
    CONSTRAINT namecard_collection_entries_snapshot
        CHECK (jsonb_typeof(snapshot) = 'object'),
    CONSTRAINT namecard_collection_entries_hidden
        CHECK (hidden_at IS NULL OR hidden_at >= obtained_at)
);

CREATE INDEX IF NOT EXISTS namecard_collection_entries_owner_idx
    ON public.namecard_collection_entries(collector_account_id, obtained_at DESC);

-- 每张卡一个固定不变的分享短链，粘贴多少次都指向同一张卡。
CREATE TABLE IF NOT EXISTS public.namecard_exchange_links (
    card_id TEXT PRIMARY KEY
        REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]{12}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 历史上的卡不会重新创建，因此在这里补齐短链；新卡在创建时写入。
INSERT INTO public.namecard_exchange_links (card_id, slug)
SELECT card.id, substr(md5(card.id || 'namecard-exchange-link'), 1, 12)
FROM public.fudaba_cards card
WHERE card.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 快速交换清单：只有持有者勾选的卡才会出现在自己的快速交换页。
CREATE TABLE IF NOT EXISTS public.namecard_quick_exchange_cards (
    account_id TEXT NOT NULL
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL
        REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id, card_id)
);

CREATE INDEX IF NOT EXISTS namecard_quick_exchange_cards_owner_idx
    ON public.namecard_quick_exchange_cards(account_id, added_at DESC);

-- 扫码交换：出示方在 App 里生成一次性二维码，另一方扫码后由服务端解析。
CREATE TABLE IF NOT EXISTS public.namecard_scan_sessions (
    id UUID PRIMARY KEY,
    -- 只存 sha256，二维码里的明文令牌不落库。
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    account_id TEXT NOT NULL
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    card_numbers BIGINT[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    consumed_by_exchange_id UUID
        REFERENCES public.namecard_exchanges(id) ON DELETE SET NULL,
    CONSTRAINT namecard_scan_sessions_cards
        CHECK (cardinality(card_numbers) BETWEEN 1 AND 20),
    CONSTRAINT namecard_scan_sessions_lifetime
        CHECK (expires_at > created_at),
    CONSTRAINT namecard_scan_sessions_consumed
        CHECK ((consumed_at IS NULL) = (consumed_by_exchange_id IS NULL))
);

CREATE INDEX IF NOT EXISTS namecard_scan_sessions_owner_idx
    ON public.namecard_scan_sessions(account_id, created_at DESC);

ALTER TABLE public.namecard_notifications
    DROP CONSTRAINT IF EXISTS namecard_notifications_kind_check;

ALTER TABLE public.namecard_notifications
    ADD CONSTRAINT namecard_notifications_kind_check
        CHECK (kind IN (
            'card-approved', 'card-rejected', 'claim-approved', 'claim-rejected',
            'station-message', 'card-locked', 'card-unlocked',
            'card-admin-edited', 'card-transferred-in', 'card-transferred-out',
            'card-feedback-accepted', 'card-feedback-rejected',
            'card-supplement-approved', 'card-supplement-rejected',
            'legacy-card-match',
            -- 手动交换：待确认与两种结果各通知一次。
            'card-exchange-requested',
            'card-exchange-accepted',
            'card-exchange-declined'
        ));

-- 旧交换申请退役：表、索引与两名守卫用的列一起删除。
DELETE FROM public.fudaba_moderation_cases
WHERE resource_kind = 'exchange';

ALTER TABLE public.fudaba_moderation_cases
    DROP CONSTRAINT IF EXISTS fudaba_moderation_cases_resource_kind_check;

ALTER TABLE public.fudaba_moderation_cases
    ADD CONSTRAINT fudaba_moderation_cases_resource_kind_check
        CHECK (resource_kind IN ('account', 'office', 'card', 'message'));

DROP TABLE IF EXISTS public.fudaba_exchange_requests;
