-- ims:migration-phase: post-data

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
