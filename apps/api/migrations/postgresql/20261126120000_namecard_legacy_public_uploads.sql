-- ims:migration-phase: post-data

-- Entries are installed from the verified production manifest, never inferred
-- from request paths or copied from Preview. No private paths are imported.
CREATE TABLE public.namecard_legacy_public_uploads (
    path TEXT PRIMARY KEY CHECK (
        path ~ '^/uploads/namecard/(original/[A-Za-z0-9._-]+\.[A-Za-z0-9]+|thumbnail/[A-Za-z0-9._-]+\.[A-Za-z0-9]+\.jpg)$'
    ),
    card_id TEXT NOT NULL REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL,
    page_version UUID NOT NULL,
    logical_key TEXT NOT NULL CHECK (logical_key LIKE 'community/namecards/assets/%'),
    object_id TEXT NOT NULL
);

CREATE INDEX namecard_legacy_public_uploads_card_idx
    ON public.namecard_legacy_public_uploads(card_id);
