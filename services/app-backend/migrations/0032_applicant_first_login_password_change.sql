ALTER TABLE applicants
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
