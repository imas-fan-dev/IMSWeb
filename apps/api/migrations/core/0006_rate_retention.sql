CREATE TABLE IF NOT EXISTS rate_limit_maintenance (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_sweep_at INTEGER NOT NULL CHECK (next_sweep_at >= 0)
);

INSERT OR IGNORE INTO rate_limit_maintenance (id, next_sweep_at)
VALUES (1, 0);
