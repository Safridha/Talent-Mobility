CREATE TABLE application_batches (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    registration_start DATE NOT NULL,
    registration_end DATE NOT NULL,
    interview_start DATE NOT NULL,
    interview_end DATE NOT NULL,
    all_units BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT application_batches_registration_order CHECK (registration_start <= registration_end),
    CONSTRAINT application_batches_interview_after_registration CHECK (registration_end < interview_start),
    CONSTRAINT application_batches_interview_order CHECK (interview_start <= interview_end)
);

CREATE UNIQUE INDEX application_batches_name_key ON application_batches (lower(trim(name)));

CREATE TABLE application_batch_departments (
    batch_id BIGINT NOT NULL REFERENCES application_batches(id) ON DELETE CASCADE,
    department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    PRIMARY KEY (batch_id, department_id)
);

ALTER TABLE applications
    ADD COLUMN batch_id BIGINT REFERENCES application_batches(id) ON DELETE RESTRICT;

CREATE INDEX applications_batch_id_idx ON applications (batch_id);

-- Batch 1 covers every work unit and adopts all applications that already exist.
INSERT INTO application_batches (name, registration_start, registration_end, interview_start, interview_end, all_units)
VALUES ('Batch 2026', DATE '2026-11-10', DATE '2026-11-30', DATE '2026-12-01', DATE '2026-12-31', TRUE);

UPDATE applications
SET batch_id = (SELECT id FROM application_batches WHERE name = 'Batch 2026')
WHERE batch_id IS NULL;
