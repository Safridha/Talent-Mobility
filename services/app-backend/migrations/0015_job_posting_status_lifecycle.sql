ALTER TABLE job_postings
    ADD COLUMN status TEXT;

UPDATE job_postings
SET status = CASE WHEN is_open THEN 'open' ELSE 'closed' END;

ALTER TABLE job_postings
    ALTER COLUMN status SET DEFAULT 'draft',
    ALTER COLUMN status SET NOT NULL,
    ADD CONSTRAINT job_postings_status_check
        CHECK (status IN ('draft', 'open', 'closed')),
    DROP COLUMN is_open;
