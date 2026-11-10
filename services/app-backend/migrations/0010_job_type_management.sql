CREATE TABLE job_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);

INSERT INTO job_types (name)
SELECT DISTINCT ON (lower(btrim(job_type))) btrim(job_type)
FROM job_postings
WHERE length(btrim(job_type)) > 0
ORDER BY lower(btrim(job_type)), btrim(job_type);

INSERT INTO job_types (name)
SELECT default_type.name
FROM (VALUES ('Full-time'), ('Contract'), ('Internship')) AS default_type(name)
WHERE NOT EXISTS (
    SELECT 1
    FROM job_types
    WHERE lower(job_types.name) = lower(default_type.name)
);

CREATE UNIQUE INDEX job_types_name_lower_idx ON job_types (lower(name));

ALTER TABLE job_postings ADD COLUMN job_type_id BIGINT;

UPDATE job_postings
SET job_type_id = job_types.id
FROM job_types
WHERE lower(btrim(job_postings.job_type)) = lower(job_types.name);

ALTER TABLE job_postings
    ALTER COLUMN job_type_id SET NOT NULL,
    ADD CONSTRAINT job_postings_job_type_id_fkey
        FOREIGN KEY (job_type_id) REFERENCES job_types(id) ON DELETE RESTRICT,
    DROP COLUMN job_type;

CREATE INDEX job_postings_job_type_id_idx ON job_postings(job_type_id);
