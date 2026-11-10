ALTER TABLE applicants
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX applicants_is_active_created_at_idx
    ON applicants (is_active, created_at DESC);
