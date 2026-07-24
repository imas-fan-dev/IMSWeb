-- ims:migration-phase: post-data

ALTER TABLE public.card_emojis
    ADD CONSTRAINT card_emojis_card_id_fkey
    FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE
    NOT VALID;
