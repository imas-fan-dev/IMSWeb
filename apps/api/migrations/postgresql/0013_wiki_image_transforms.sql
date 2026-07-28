-- ims:migration-phase: post-data

ALTER TABLE public.idols
    ALTER COLUMN color DROP NOT NULL;

ALTER TABLE public.agencies
    ADD COLUMN icon_fit TEXT NOT NULL DEFAULT 'contain',
    ADD COLUMN icon_focal_x DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN icon_focal_y DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN icon_zoom DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN icon_rotation INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN icon_media_revision INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT agencies_icon_fit_check
        CHECK (icon_fit IN ('cover', 'contain')),
    ADD CONSTRAINT agencies_icon_focal_x_check
        CHECK (icon_focal_x BETWEEN 0 AND 1),
    ADD CONSTRAINT agencies_icon_focal_y_check
        CHECK (icon_focal_y BETWEEN 0 AND 1),
    ADD CONSTRAINT agencies_icon_zoom_check
        CHECK (icon_zoom BETWEEN 1 AND 3),
    ADD CONSTRAINT agencies_icon_rotation_check
        CHECK (icon_rotation IN (0, 90, 180, 270)),
    ADD CONSTRAINT agencies_icon_media_revision_check
        CHECK (icon_media_revision >= 0);

ALTER TABLE public.wiki_groups
    ADD COLUMN icon_fit TEXT NOT NULL DEFAULT 'contain',
    ADD COLUMN icon_focal_x DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN icon_focal_y DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN icon_zoom DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN icon_rotation INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN icon_media_revision INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT wiki_groups_icon_fit_check
        CHECK (icon_fit IN ('cover', 'contain')),
    ADD CONSTRAINT wiki_groups_icon_focal_x_check
        CHECK (icon_focal_x BETWEEN 0 AND 1),
    ADD CONSTRAINT wiki_groups_icon_focal_y_check
        CHECK (icon_focal_y BETWEEN 0 AND 1),
    ADD CONSTRAINT wiki_groups_icon_zoom_check
        CHECK (icon_zoom BETWEEN 1 AND 3),
    ADD CONSTRAINT wiki_groups_icon_rotation_check
        CHECK (icon_rotation IN (0, 90, 180, 270)),
    ADD CONSTRAINT wiki_groups_icon_media_revision_check
        CHECK (icon_media_revision >= 0);

ALTER TABLE public.idols
    ADD COLUMN avatar_focal_x DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN avatar_focal_y DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN avatar_zoom DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN avatar_rotation INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN avatar_media_revision INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT idols_avatar_focal_x_check
        CHECK (avatar_focal_x BETWEEN 0 AND 1),
    ADD CONSTRAINT idols_avatar_focal_y_check
        CHECK (avatar_focal_y BETWEEN 0 AND 1),
    ADD CONSTRAINT idols_avatar_zoom_check
        CHECK (avatar_zoom BETWEEN 1 AND 3),
    ADD CONSTRAINT idols_avatar_rotation_check
        CHECK (avatar_rotation IN (0, 90, 180, 270)),
    ADD CONSTRAINT idols_avatar_media_revision_check
        CHECK (avatar_media_revision >= 0);

ALTER TABLE public.wiki_story_cards
    ADD COLUMN image_fit TEXT NOT NULL DEFAULT 'cover',
    ADD COLUMN image_focal_x DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN image_focal_y DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN image_zoom DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN image_rotation INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN image_media_revision INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT wiki_story_cards_image_fit_check
        CHECK (image_fit IN ('cover', 'contain')),
    ADD CONSTRAINT wiki_story_cards_image_focal_x_check
        CHECK (image_focal_x BETWEEN 0 AND 1),
    ADD CONSTRAINT wiki_story_cards_image_focal_y_check
        CHECK (image_focal_y BETWEEN 0 AND 1),
    ADD CONSTRAINT wiki_story_cards_image_zoom_check
        CHECK (image_zoom BETWEEN 1 AND 3),
    ADD CONSTRAINT wiki_story_cards_image_rotation_check
        CHECK (image_rotation IN (0, 90, 180, 270)),
    ADD CONSTRAINT wiki_story_cards_image_media_revision_check
        CHECK (image_media_revision >= 0);
