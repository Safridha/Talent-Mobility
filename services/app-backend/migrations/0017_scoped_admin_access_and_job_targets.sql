ALTER TABLE admins
    ADD COLUMN admin_role TEXT NOT NULL DEFAULT 'super_admin'
        CHECK (admin_role IN ('super_admin', 'division_admin', 'department_admin', 'bureau_admin')),
    ADD COLUMN division_id BIGINT REFERENCES divisions(id) ON DELETE RESTRICT,
    ADD COLUMN department_id BIGINT REFERENCES departments(id) ON DELETE RESTRICT,
    ADD COLUMN bureau_id BIGINT REFERENCES bureaus(id) ON DELETE RESTRICT,
    ADD CONSTRAINT admins_scope_matches_role_check CHECK (
        (admin_role = 'super_admin' AND division_id IS NULL AND department_id IS NULL AND bureau_id IS NULL)
        OR (admin_role = 'division_admin' AND division_id IS NOT NULL AND department_id IS NULL AND bureau_id IS NULL)
        OR (admin_role = 'department_admin' AND division_id IS NULL AND department_id IS NOT NULL AND bureau_id IS NULL)
        OR (admin_role = 'bureau_admin' AND division_id IS NULL AND department_id IS NULL AND bureau_id IS NOT NULL)
    );

CREATE INDEX admins_division_scope_idx
    ON admins (division_id)
    WHERE admin_role = 'division_admin' AND is_active = TRUE;
CREATE INDEX admins_department_scope_idx
    ON admins (department_id)
    WHERE admin_role = 'department_admin' AND is_active = TRUE;
CREATE INDEX admins_bureau_scope_idx
    ON admins (bureau_id)
    WHERE admin_role = 'bureau_admin' AND is_active = TRUE;

ALTER TABLE job_postings
    ADD COLUMN target_level TEXT NOT NULL DEFAULT 'bureau'
        CHECK (target_level IN ('division', 'department', 'bureau')),
    ADD COLUMN division_id BIGINT REFERENCES divisions(id) ON DELETE RESTRICT,
    ADD COLUMN department_id BIGINT REFERENCES departments(id) ON DELETE RESTRICT;

UPDATE job_postings
SET division_id = departments.division_id,
    department_id = bureaus.department_id
FROM bureaus
JOIN departments ON departments.id = bureaus.department_id
WHERE job_postings.bureau_id = bureaus.id;

ALTER TABLE job_postings
    ALTER COLUMN division_id SET NOT NULL,
    ALTER COLUMN bureau_id DROP NOT NULL,
    ADD CONSTRAINT job_postings_target_scope_check CHECK (
        (target_level = 'division' AND department_id IS NULL AND bureau_id IS NULL)
        OR (target_level = 'department' AND department_id IS NOT NULL AND bureau_id IS NULL)
        OR (target_level = 'bureau' AND department_id IS NOT NULL AND bureau_id IS NOT NULL)
    );

CREATE INDEX job_postings_department_target_idx ON job_postings (department_id);
CREATE INDEX job_postings_division_target_idx ON job_postings (division_id);

ALTER TABLE departments
    ADD CONSTRAINT departments_id_division_id_unique UNIQUE (id, division_id);
ALTER TABLE bureaus
    ADD CONSTRAINT bureaus_id_department_id_unique UNIQUE (id, department_id);
ALTER TABLE job_postings
    DROP CONSTRAINT job_postings_bureau_id_fkey,
    ADD CONSTRAINT job_postings_department_division_fkey
        FOREIGN KEY (department_id, division_id)
        REFERENCES departments(id, division_id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_postings_bureau_department_fkey
        FOREIGN KEY (bureau_id, department_id)
        REFERENCES bureaus(id, department_id) ON DELETE RESTRICT;

CREATE TABLE admin_application_notifications (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL DEFAULT 'new_application'
        CHECK (notification_type = 'new_application'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    UNIQUE (admin_id, application_id, notification_type)
);

CREATE INDEX admin_application_notifications_unread_idx
    ON admin_application_notifications (admin_id, created_at DESC, id DESC)
    WHERE read_at IS NULL;
