-- ims:migration-phase: post-data

CREATE FUNCTION public.fudaba_invalidate_page_preview() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.queue = 'live' THEN
        DELETE FROM public.fudaba_card_media_previews
        WHERE object_key = 'community/fudaba/cards/' || OLD.card_id || '/' ||
            OLD.object_queue || '/' || OLD.page_id || '.' || OLD.object_version || '.webp';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER fudaba_page_preview_invalidation
AFTER UPDATE OR DELETE ON public.fudaba_card_pages
FOR EACH ROW EXECUTE FUNCTION public.fudaba_invalidate_page_preview();
