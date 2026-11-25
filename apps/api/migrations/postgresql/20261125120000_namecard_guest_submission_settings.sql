-- ims:migration-phase: post-data

CREATE TABLE public.namecard_guest_submission_settings (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO public.namecard_guest_submission_settings (singleton_id) VALUES (1);
