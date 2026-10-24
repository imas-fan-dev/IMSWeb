-- ims:migration-phase: post-data
-- Compatibility uploads can reuse an object key. Invalidate inside the card update
-- transaction so a failed preview write cannot leave an old image paired with it.
CREATE FUNCTION fudaba_invalidate_card_preview() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM fudaba_card_media_previews
    WHERE object_key = CASE WHEN TG_ARGV[0] = 'front' THEN NEW.front_object_key ELSE NEW.back_object_key END;
    RETURN NEW;
END;
$$;
CREATE TRIGGER fudaba_card_front_preview_invalidation
AFTER UPDATE OF front_object_key ON fudaba_cards
FOR EACH ROW EXECUTE FUNCTION fudaba_invalidate_card_preview('front');
CREATE TRIGGER fudaba_card_back_preview_invalidation
AFTER UPDATE OF back_object_key ON fudaba_cards
FOR EACH ROW EXECUTE FUNCTION fudaba_invalidate_card_preview('back');
