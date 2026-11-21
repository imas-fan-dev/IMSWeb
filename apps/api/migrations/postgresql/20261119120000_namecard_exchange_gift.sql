-- ims:migration-phase: pre-data
--
-- 单向送礼：`namecard_exchanges.source` 多一种 `gift`。
--
-- 这一列的行内 CHECK 是在建表迁移里写的，历史迁移不改；这里重建同名约束
-- （PostgreSQL 对行内列约束的默认命名），旧入口保持不变。
ALTER TABLE public.namecard_exchanges
    DROP CONSTRAINT IF EXISTS namecard_exchanges_source_check;

ALTER TABLE public.namecard_exchanges
    ADD CONSTRAINT namecard_exchanges_source_check
        CHECK (source IN ('card-share', 'card-request', 'quick', 'scan', 'gift'));
