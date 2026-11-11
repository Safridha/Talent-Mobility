ALTER TABLE applications
    DROP CONSTRAINT applications_job_or_direct_target_check,
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
            AND (
                position_description IS NULL
                OR length(trim(position_description)) > 0
            )
        )
    );
