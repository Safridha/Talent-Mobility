-- A batch can open whole departments (application_batch_departments) and/or individual biro / bengkel.
-- Existing batches keep working: their department selection still opens every biro under it.
CREATE TABLE application_batch_bureaus (
    batch_id BIGINT NOT NULL REFERENCES application_batches(id) ON DELETE CASCADE,
    bureau_id BIGINT NOT NULL REFERENCES bureaus(id) ON DELETE CASCADE,
    PRIMARY KEY (batch_id, bureau_id)
);

CREATE INDEX application_batch_bureaus_bureau_idx ON application_batch_bureaus (bureau_id);
