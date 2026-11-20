-- ims:migration-phase: pre-data
--
-- 名片标签系统：预设标签 / 别名 / 名片标签 / 屏蔽词。
--
-- 标签即时生效，不进入名片内容的待审载荷；因此这四张表与
-- `fudaba_cards` 的 publication/review 列完全解耦，只按 card_id 关联。
-- 删预设用 `SET NULL`，相关名片标签自动退回自由标签（显示名不变）。
-- 删名片沿用 `CASCADE`，标签不留下孤儿行。

CREATE TABLE IF NOT EXISTS public.namecard_tag_presets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    normalized TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.namecard_tag_aliases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    preset_id BIGINT NOT NULL REFERENCES public.namecard_tag_presets(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    normalized TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS namecard_tag_aliases_preset_idx
    ON public.namecard_tag_aliases(preset_id);

CREATE TABLE IF NOT EXISTS public.namecard_tags (
    card_id TEXT NOT NULL REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    -- 显示用文本：保留用户输入的大小写与全半角形态。
    name TEXT NOT NULL,
    -- 比较键：NFKC + 小写 + 空白折叠后的形态。
    normalized TEXT NOT NULL,
    preset_id BIGINT NULL REFERENCES public.namecard_tag_presets(id) ON DELETE SET NULL,
    -- 展示顺序：写入时按数组下标落库，读侧 ORDER BY display_order。
    display_order SMALLINT NOT NULL,
    PRIMARY KEY (card_id, normalized)
);

CREATE INDEX IF NOT EXISTS namecard_tags_normalized_idx
    ON public.namecard_tags(normalized);
CREATE INDEX IF NOT EXISTS namecard_tags_preset_idx
    ON public.namecard_tags(preset_id);

-- 全局首次出现时间：后台「最近首次出现」排序用；同一标签再加到别的名片不刷新。
CREATE TABLE IF NOT EXISTS public.namecard_tag_registry (
    normalized TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.namecard_tag_blocklist (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pattern TEXT NOT NULL,
    is_regex BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
