ALTER TABLE bureaus
    ADD COLUMN unit_type TEXT NOT NULL DEFAULT 'biro'
        CHECK (unit_type IN ('biro', 'bengkel'));

UPDATE bureaus
SET unit_type = CASE
    WHEN name ILIKE 'Bengkel %' THEN 'bengkel'
    ELSE 'biro'
END;

ALTER TABLE job_postings
    DROP CONSTRAINT job_postings_target_level_check,
    ADD CONSTRAINT job_postings_target_level_check
        CHECK (target_level IN ('division', 'secretariat', 'department', 'bureau')),
    DROP CONSTRAINT job_postings_target_scope_check,
    ADD CONSTRAINT job_postings_target_scope_check CHECK (
        (target_level IN ('division', 'secretariat') AND department_id IS NULL AND bureau_id IS NULL)
        OR (target_level = 'department' AND department_id IS NOT NULL AND bureau_id IS NULL)
        OR (target_level = 'bureau' AND department_id IS NOT NULL AND bureau_id IS NOT NULL)
    );

ALTER TABLE admin_permissions
    DROP CONSTRAINT admin_permissions_permission_key_check,
    ADD CONSTRAINT admin_permissions_permission_key_check CHECK (
        permission_key IN (
            'jobs.view',
            'jobs.create',
            'jobs.update',
            'jobs.delete',
            'jobs.change_status',
            'applications.view',
            'applications.change_status',
            'applications.download_documents',
            'job_types.manage',
            'applicant_accounts.manage',
            'employees.view',
            'employees.manage'
        )
    );

CREATE TABLE employee_directory (
    id BIGSERIAL PRIMARY KEY,
    employee_number TEXT NOT NULL UNIQUE CHECK (length(employee_number) BETWEEN 1 AND 40),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    position_title TEXT NOT NULL CHECK (length(position_title) BETWEEN 1 AND 160),
    target_level TEXT NOT NULL
        CHECK (target_level IN ('division', 'secretariat', 'department', 'bureau')),
    division_id BIGINT NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
    department_id BIGINT,
    bureau_id BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT employee_directory_target_scope_check CHECK (
        (target_level IN ('division', 'secretariat') AND department_id IS NULL AND bureau_id IS NULL)
        OR (target_level = 'department' AND department_id IS NOT NULL AND bureau_id IS NULL)
        OR (target_level = 'bureau' AND department_id IS NOT NULL AND bureau_id IS NOT NULL)
    ),
    CONSTRAINT employee_directory_department_division_fkey
        FOREIGN KEY (department_id, division_id)
        REFERENCES departments(id, division_id) ON DELETE RESTRICT,
    CONSTRAINT employee_directory_bureau_department_fkey
        FOREIGN KEY (bureau_id, department_id)
        REFERENCES bureaus(id, department_id) ON DELETE RESTRICT
);

CREATE INDEX employee_directory_division_idx ON employee_directory (division_id, name);
CREATE INDEX employee_directory_department_idx ON employee_directory (department_id, name);
CREATE INDEX employee_directory_bureau_idx ON employee_directory (bureau_id, name);
