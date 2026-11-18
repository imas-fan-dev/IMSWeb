-- ims:migration-phase: post-data
--
-- 名片册 / 名片墙共用的排序元数据（PRD §3.4）：把「按制作人名排序」的依据
-- 落到名片行上，读写一次就不必在查询时现算拼音/罗马音。
--
-- `sort_name_key` 是 PRD §3.1 阶梯归一化后的比较键（小写、无空白），
-- `sort_name_bucket` 标明来源：0=英文、1=假名罗马音、2=中文拼音、3=特殊符号。
-- 键由 `apps/api/src/utils/sorting/namecard-sort-key.ts` 生成；既有行由
-- `migration:namecard-sort-keys` 回填。默认值让迁移与未回填的旧行都安全可读。

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS sort_name_key TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sort_name_bucket SMALLINT NOT NULL DEFAULT 3;

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_sort_name_bucket_check;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_sort_name_bucket_check
        CHECK (sort_name_bucket BETWEEN 0 AND 3);

-- 排序键与其他名片元数据无关；一个联合索引足以支持「按名称」的整列排序。
CREATE INDEX IF NOT EXISTS fudaba_cards_sort_name_idx
    ON public.fudaba_cards(sort_name_bucket, sort_name_key);
