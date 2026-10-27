-- ims:migration-phase: post-data

ALTER TABLE public.fudaba_office_public_locations
    ADD COLUMN precision TEXT NOT NULL DEFAULT 'regional',
    ADD COLUMN latitude_exact DOUBLE PRECISION,
    ADD COLUMN longitude_exact DOUBLE PRECISION,
    ADD COLUMN exact_location_consent_at TIMESTAMPTZ,
    ADD CONSTRAINT fudaba_public_location_precision_check CHECK (
        (
            precision = 'regional'
            AND latitude_exact IS NULL
            AND longitude_exact IS NULL
            AND exact_location_consent_at IS NULL
        ) OR (
            precision = 'exact'
            AND latitude_exact IS NOT NULL
            AND longitude_exact IS NOT NULL
            AND latitude_exact BETWEEN -60 AND 60
            AND longitude_exact BETWEEN -180 AND 180
            AND exact_location_consent_at IS NOT NULL
            AND exact_location_consent_at = submitted_at
        )
    );

CREATE INDEX fudaba_office_public_locations_exact_public_idx
    ON public.fudaba_office_public_locations (
        latitude_exact, longitude_exact, office_id
    ) WHERE review_state = 'published' AND precision = 'exact';
