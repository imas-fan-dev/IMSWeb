-- ims:migration-phase: post-data

-- Legacy percentages remain a read projection. World coordinates are authoritative.
ALTER TABLE public.fudaba_office_cards
    ADD COLUMN world_x DOUBLE PRECISION,
    ADD COLUMN world_y DOUBLE PRECISION;
DROP TRIGGER fudaba_office_cards_transition_insert_update ON public.fudaba_office_cards;
UPDATE public.fudaba_office_cards
    SET world_x = 160 + position_x * 12.8, world_y = 120 + position_y * 6.6;
ALTER TABLE public.fudaba_office_cards
    ALTER COLUMN world_x SET NOT NULL,
    ALTER COLUMN world_y SET NOT NULL,
    ADD CONSTRAINT fudaba_wall_world_x CHECK (world_x BETWEEN -1000000 AND 1000000),
    ADD CONSTRAINT fudaba_wall_world_y CHECK (world_y BETWEEN -1000000 AND 1000000),
    DROP CONSTRAINT fudaba_office_cards_z_index_check,
    ADD CONSTRAINT fudaba_wall_stack CHECK (z_index BETWEEN 1 AND 2147483000);
CREATE TRIGGER fudaba_office_cards_transition_insert_update
BEFORE INSERT OR UPDATE ON public.fudaba_office_cards
FOR EACH ROW EXECUTE FUNCTION public.fudaba_validate_placement_transition();

CREATE TABLE public.fudaba_office_walls (
    office_id TEXT PRIMARY KEY REFERENCES public.fudaba_offices(id) ON DELETE CASCADE,
    layout_version INTEGER NOT NULL DEFAULT 1 CHECK (layout_version = 1),
    left_edge DOUBLE PRECISION NOT NULL DEFAULT 0,
    top_edge DOUBLE PRECISION NOT NULL DEFAULT 0,
    right_edge DOUBLE PRECISION NOT NULL DEFAULT 1600,
    bottom_edge DOUBLE PRECISION NOT NULL DEFAULT 900,
    max_z_index INTEGER NOT NULL DEFAULT 0 CHECK (max_z_index BETWEEN 0 AND 2147483000),
    CHECK (left_edge >= -1001600 AND top_edge >= -1001700
        AND right_edge <= 1001600 AND bottom_edge <= 1001700
        AND left_edge < right_edge AND top_edge < bottom_edge)
);
INSERT INTO public.fudaba_office_walls (office_id, max_z_index)
SELECT office.id, COALESCE(MAX(placement.z_index), 0)
FROM public.fudaba_offices office
LEFT JOIN public.fudaba_office_cards placement ON placement.office_id = office.id
GROUP BY office.id;

CREATE FUNCTION public.fudaba_project_world_placement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Historical imports and internal legacy helpers map to the fixed initial canvas.
        NEW.world_x := COALESCE(NEW.world_x, 160 + NEW.position_x * 12.8);
        NEW.world_y := COALESCE(NEW.world_y, 120 + NEW.position_y * 6.6);
    ELSIF (NEW.position_x IS DISTINCT FROM OLD.position_x
        OR NEW.position_y IS DISTINCT FROM OLD.position_y)
        AND NEW.world_x IS NOT DISTINCT FROM OLD.world_x
        AND NEW.world_y IS NOT DISTINCT FROM OLD.world_y THEN
        RAISE EXCEPTION 'FUDABA_WALL_LAYOUT_CONFLICT';
    END IF;
    NEW.position_x := LEAST(100, GREATEST(0, (NEW.world_x - 160) / 12.8));
    NEW.position_y := LEAST(100, GREATEST(0, (NEW.world_y - 120) / 6.6));
    RETURN NEW;
END;
$$;
CREATE TRIGGER fudaba_office_cards_world_projection
BEFORE INSERT OR UPDATE ON public.fudaba_office_cards
FOR EACH ROW EXECUTE FUNCTION public.fudaba_project_world_placement();

CREATE FUNCTION public.fudaba_expand_office_wall()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.fudaba_office_walls (office_id)
        VALUES (NEW.office_id) ON CONFLICT DO NOTHING;
    -- The existing active-office trigger locks the office before this trigger.
    UPDATE public.fudaba_office_walls SET
        left_edge = LEAST(left_edge, FLOOR((NEW.world_x - 160) / 1600) * 1600),
        top_edge = LEAST(top_edge, FLOOR((NEW.world_y - 120) / 900) * 900),
        right_edge = GREATEST(right_edge, CEIL((NEW.world_x + 160) / 1600) * 1600),
        bottom_edge = GREATEST(bottom_edge, CEIL((NEW.world_y + 120) / 900) * 900),
        max_z_index = GREATEST(max_z_index, NEW.z_index)
    WHERE office_id = NEW.office_id;
    RETURN NEW;
END;
$$;
CREATE TRIGGER fudaba_office_cards_world_extent
AFTER INSERT OR UPDATE ON public.fudaba_office_cards
FOR EACH ROW EXECUTE FUNCTION public.fudaba_expand_office_wall();

CREATE INDEX fudaba_office_cards_world_region_idx
    ON public.fudaba_office_cards (office_id, world_x, world_y);
CREATE INDEX fudaba_office_cards_world_page_idx
    ON public.fudaba_office_cards (office_id, pinned_at, card_id);

CREATE FUNCTION public.fudaba_initialize_office_wall()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.fudaba_office_walls (office_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER fudaba_office_wall_insert AFTER INSERT ON public.fudaba_offices
FOR EACH ROW EXECUTE FUNCTION public.fudaba_initialize_office_wall();
