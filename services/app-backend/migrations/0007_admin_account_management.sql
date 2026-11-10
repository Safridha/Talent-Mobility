ALTER TABLE admins
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX admins_is_active_created_at_idx
    ON admins (is_active, created_at DESC);
