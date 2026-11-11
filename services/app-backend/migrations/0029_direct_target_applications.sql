ALTER TABLE applications
    ALTER COLUMN job_id DROP NOT NULL,
    ADD COLUMN target_department_id BIGINT REFERENCES departments(id) ON DELETE RESTRICT,
    ADD COLUMN target_bureau_id BIGINT,
    ADD COLUMN position_description TEXT,
    ADD CONSTRAINT applications_direct_target_bureau_department_fkey
        FOREIGN KEY (target_bureau_id, target_department_id)
        REFERENCES bureaus(id, department_id) ON DELETE RESTRICT,
    ADD CONSTRAINT applications_job_or_direct_target_check CHECK (
        (
            job_id IS NOT NULL
            AND target_department_id IS NULL
            AND target_bureau_id IS NULL
            AND position_description IS NULL
        )
        OR (
            job_id IS NULL
            AND target_department_id IS NOT NULL
            AND position_description IS NOT NULL
            AND length(trim(position_description)) > 0
        )
    );

CREATE UNIQUE INDEX applications_nonrejected_applicant_direct_department_idx
    ON applications (applicant_id, target_department_id)
    WHERE job_id IS NULL
        AND target_bureau_id IS NULL
        AND status <> 'rejected';

CREATE UNIQUE INDEX applications_nonrejected_applicant_direct_bureau_idx
    ON applications (applicant_id, target_bureau_id)
    WHERE job_id IS NULL
        AND target_bureau_id IS NOT NULL
        AND status <> 'rejected';
