ALTER TABLE idempotency_keys ADD COLUMN generation INTEGER NOT NULL DEFAULT 1
    CHECK (generation >= 1);
