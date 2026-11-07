-- ims:migration-phase: post-data
--
-- 名片图片统一：每一面一个稳定槽位，按队列（live / pending）与版本寻址。
--
-- 目标 key：cards/<cardId>/<queue>/<pageId>.<version>.webp
--   pageId  = front | back | page-<uuid>（中间页取稳定槽位，不随显示顺序变化）
--   version = 每次写入的新 uuid，保证地址不可变
--
-- 这张表取代 fudaba_cards 的 5 个 key 列与 fudaba_card_media；迁移期双写，
-- 旧列在数据迁移完成并观察一个版本后再删除。

CREATE TABLE IF NOT EXISTS public.fudaba_card_pages (
    card_id text NOT NULL REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    queue text NOT NULL,
    page_id text NOT NULL,
    display_order integer NOT NULL,
    object_version uuid NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT fudaba_card_pages_pkey PRIMARY KEY (card_id, queue, page_id),
    CONSTRAINT fudaba_card_pages_queue_check CHECK (queue IN ('live', 'pending')),
    CONSTRAINT fudaba_card_pages_page_id_check CHECK (
        page_id = 'front' OR page_id = 'back' OR page_id ~ '^page-[0-9a-f-]{8,}$'
    ),
    CONSTRAINT fudaba_card_pages_order_unique UNIQUE (card_id, queue, display_order),
    CONSTRAINT fudaba_card_pages_size_check CHECK (width > 0 AND height > 0)
);

CREATE INDEX IF NOT EXISTS fudaba_card_pages_queue_order_idx
    ON public.fudaba_card_pages (card_id, queue, display_order);
