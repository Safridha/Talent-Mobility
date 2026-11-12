-- Idempotency keys for requests that create something (apply for a unit, create an account).
-- A client generates one key per user intent and resends it on every retry; the server stores the
-- response in the same transaction as the work, so a retry or a double click replays the first
-- result instead of creating a duplicate.
CREATE TABLE idempotency_keys (
    scope TEXT NOT NULL,
    key TEXT NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
    fingerprint TEXT NOT NULL,
    response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scope, key)
);

CREATE INDEX idempotency_keys_created_at_idx ON idempotency_keys (created_at);

COMMENT ON TABLE idempotency_keys IS 'Replayable responses keyed by (scope, Idempotency-Key). Rows older than 48 hours are purged.';
