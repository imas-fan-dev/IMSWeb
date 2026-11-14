-- ims:migration-phase: post-data
--
-- A page row can reference an unchanged live object while being part of a
-- complete pending snapshot. `object_queue` records where the object lives;
-- `queue` records which surface shows the row.

ALTER TABLE public.fudaba_card_pages
    ADD COLUMN IF NOT EXISTS object_queue text NOT NULL DEFAULT 'live';

UPDATE public.fudaba_card_pages
   SET object_queue = CASE WHEN queue = 'pending' THEN 'pending' ELSE 'live' END
 WHERE object_queue = 'live' AND queue = 'pending';

ALTER TABLE public.fudaba_card_pages
    DROP CONSTRAINT IF EXISTS fudaba_card_pages_object_queue_check;

ALTER TABLE public.fudaba_card_pages
    ADD CONSTRAINT fudaba_card_pages_object_queue_check
    CHECK (object_queue IN ('live', 'pending'));
