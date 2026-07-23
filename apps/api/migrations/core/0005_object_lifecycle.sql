ALTER TABLE compensation_jobs ADD COLUMN next_attempt_at TEXT;
ALTER TABLE compensation_jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE compensation_jobs ADD COLUMN quarantined_at TEXT;
ALTER TABLE object_index ADD COLUMN owner_token TEXT;
ALTER TABLE upload_operations ADD COLUMN owner_token TEXT;
ALTER TABLE object_index ADD COLUMN incarnation INTEGER NOT NULL DEFAULT 1
    CHECK (incarnation >= 1);
ALTER TABLE upload_operations ADD COLUMN incarnation INTEGER NOT NULL DEFAULT 1
    CHECK (incarnation >= 1);
ALTER TABLE object_index ADD COLUMN mutation_token TEXT;
ALTER TABLE object_index ADD COLUMN recovery_source_key TEXT;
ALTER TABLE upload_operations ADD COLUMN mutation_token TEXT;
ALTER TABLE upload_operations ADD COLUMN recovery_source_key TEXT;
ALTER TABLE upload_operations ADD COLUMN previous_mutation_token TEXT;
ALTER TABLE upload_operations ADD COLUMN previous_state TEXT
    CHECK (previous_state IS NULL OR previous_state IN ('uploading', 'pending', 'ready', 'deleted'));
ALTER TABLE chronicle_metadata ADD COLUMN commit_token TEXT;

UPDATE compensation_jobs
SET next_attempt_at=COALESCE(next_attempt_at, created_at)
WHERE state IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_compensation_jobs_schedule
    ON compensation_jobs(quarantined_at, state, attempts, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_object_index_pending_publication
    ON object_index(state, updated_at, logical_key);
