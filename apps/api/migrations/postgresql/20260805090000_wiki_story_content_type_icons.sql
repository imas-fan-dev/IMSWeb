-- ims:migration-phase: post-data

ALTER TABLE public.wiki_story_content_types
    ADD COLUMN icon_name TEXT NOT NULL DEFAULT 'link-2',
    ADD CONSTRAINT wiki_story_content_types_icon_name_check CHECK (
        length(icon_name) BETWEEN 1 AND 80
        AND icon_name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    );

UPDATE public.wiki_story_content_types
SET icon_name = CASE name
    WHEN '剧情' THEN 'book-open-text'
    WHEN '语音' THEN 'mic-2'
    WHEN '电话' THEN 'phone'
    WHEN '文本专栏' THEN 'notebook-tabs'
    ELSE icon_name
END;

COMMENT ON COLUMN public.wiki_story_content_types.icon_name IS
    'Lucide icon name rendered beside public Wiki story sources.';
