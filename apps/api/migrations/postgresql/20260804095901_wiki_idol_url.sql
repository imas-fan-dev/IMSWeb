-- ims:migration-phase: post-data

ALTER TABLE public.idols
    ADD COLUMN wiki_url TEXT,
    ADD CONSTRAINT idols_wiki_url_http_check CHECK (
        wiki_url IS NULL
        OR (
            length(wiki_url) BETWEEN 1 AND 2048
            AND wiki_url ~* '^https?://'
        )
    );

COMMENT ON COLUMN public.idols.wiki_url IS
    'Optional external HTTP(S) Wiki page for this content page.';
