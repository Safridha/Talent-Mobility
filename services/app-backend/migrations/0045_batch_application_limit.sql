-- The per-applicant application limit now belongs to each batch (NULL = no limit).
ALTER TABLE application_batches
    ADD COLUMN max_applications INTEGER CHECK (max_applications BETWEEN 1 AND 10000);

UPDATE application_batches
SET max_applications = (SELECT max_applications FROM applicant_application_limit WHERE id = 1);

DROP TABLE applicant_application_limit;
