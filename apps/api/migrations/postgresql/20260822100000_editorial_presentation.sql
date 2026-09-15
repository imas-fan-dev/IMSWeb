-- ims:migration-phase: post-data

ALTER TABLE public.articles
    ADD COLUMN cover_focal_x DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN cover_focal_y DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN cover_zoom DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE public.articles
    ADD CONSTRAINT articles_cover_focal_x_check
        CHECK (cover_focal_x BETWEEN 0 AND 1),
    ADD CONSTRAINT articles_cover_focal_y_check
        CHECK (cover_focal_y BETWEEN 0 AND 1),
    ADD CONSTRAINT articles_cover_zoom_check
        CHECK (cover_zoom BETWEEN 1 AND 3);

ALTER TABLE public.events
    ADD COLUMN related_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.events
    ADD CONSTRAINT events_related_links_array_check
        CHECK (jsonb_typeof(related_links) = 'array');

UPDATE public.events
SET related_links = CASE
    WHEN NULLIF(BTRIM(registration_url), '') IS NOT NULL
         AND NULLIF(BTRIM(source_url), '') IS NOT NULL
         AND BTRIM(registration_url) <> BTRIM(source_url)
        THEN jsonb_build_array(
            jsonb_build_object('label', '报名 / 查看链接', 'url', BTRIM(registration_url)),
            jsonb_build_object('label', '查看原页面', 'url', BTRIM(source_url))
        )
    WHEN NULLIF(BTRIM(registration_url), '') IS NOT NULL
        THEN jsonb_build_array(
            jsonb_build_object('label', '报名 / 查看链接', 'url', BTRIM(registration_url))
        )
    WHEN NULLIF(BTRIM(source_url), '') IS NOT NULL
        THEN jsonb_build_array(
            jsonb_build_object('label', '查看原页面', 'url', BTRIM(source_url))
        )
    ELSE '[]'::jsonb
END
WHERE related_links = '[]'::jsonb;
