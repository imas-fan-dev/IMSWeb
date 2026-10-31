-- ims:migration-phase: post-data

-- 读音里的撇号与连字符用来分隔音节，排序前再过滤，因此允许入库。
ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_producer_reading_check;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_producer_reading_check CHECK (
        producer_reading IS NULL
        OR (
            length(btrim(producer_reading)) BETWEEN 1 AND 80
            AND producer_reading ~ '^[ぁ-ゖァ-ヺーA-Za-z ''-]+$'
        )
    );
