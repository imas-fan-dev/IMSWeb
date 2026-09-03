-- ims:migration-phase: post-data

-- The original editorial migration upgraded the events that existed at that
-- time. Legacy write endpoints could still create rows afterwards, leaving
-- public events without an article and therefore absent from the new CMS.
-- Upgrade every remaining row in place so event URLs and foreign references
-- continue to use the original event ID.
DO $$
DECLARE
    legacy_event RECORD;
    created_article_id BIGINT;
BEGIN
    FOR legacy_event IN
        SELECT e.id, e.title, e.image_url, e.created_at, e.publication_state
        FROM public.events e
        WHERE e.article_id IS NULL
        ORDER BY e.id ASC
    LOOP
        INSERT INTO public.articles (
            content_type,
            title,
            cover_url,
            body_json,
            body_html,
            status,
            revision,
            created_at,
            updated_at,
            published_at
        ) VALUES (
            'event',
            COALESCE(NULLIF(BTRIM(legacy_event.title), ''), '未命名活动'),
            NULLIF(BTRIM(legacy_event.image_url), ''),
            '{"type":"doc","content":[]}'::jsonb,
            '',
            CASE WHEN legacy_event.publication_state = 'ready' THEN 'published' ELSE 'draft' END,
            0,
            COALESCE(legacy_event.created_at, CURRENT_TIMESTAMP),
            COALESCE(legacy_event.created_at, CURRENT_TIMESTAMP),
            CASE
                WHEN legacy_event.publication_state = 'ready'
                    THEN COALESCE(legacy_event.created_at, CURRENT_TIMESTAMP)
                ELSE NULL
            END
        ) RETURNING id INTO created_article_id;

        UPDATE public.events
        SET article_id = created_article_id
        WHERE id = legacy_event.id
          AND article_id IS NULL;
    END LOOP;
END $$;
