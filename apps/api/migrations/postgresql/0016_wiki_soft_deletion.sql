-- ims:migration-phase: post-data

ALTER TABLE public.idols
    ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE public.wiki_story_cards
    ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE public.wiki_story_links
    ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idols_active_agency_order_idx
    ON public.idols(agency_id, display_order, id)
    WHERE deleted_at IS NULL;

CREATE INDEX wiki_story_cards_active_idol_order_idx
    ON public.wiki_story_cards(agency_id, idol_id, display_order, id)
    WHERE deleted_at IS NULL;

CREATE INDEX wiki_story_links_active_card_order_idx
    ON public.wiki_story_links(card_id, display_order, id)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.idols.deleted_at IS
    'Soft-deletion timestamp; associated story cards and links remain recoverable.';
COMMENT ON COLUMN public.wiki_story_cards.deleted_at IS
    'Soft-deletion timestamp inherited from an idol removal.';
COMMENT ON COLUMN public.wiki_story_links.deleted_at IS
    'Soft-deletion timestamp inherited from an idol removal.';
