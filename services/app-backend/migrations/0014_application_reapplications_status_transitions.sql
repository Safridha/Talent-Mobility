ALTER TABLE applications
    DROP CONSTRAINT applications_applicant_id_job_id_key;

CREATE UNIQUE INDEX applications_nonrejected_applicant_job_idx
    ON applications (applicant_id, job_id)
    WHERE status <> 'rejected';
