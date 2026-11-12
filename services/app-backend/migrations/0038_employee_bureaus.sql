-- Biro / Bengkel master data under each employee-roster department. The Excel roster has no
-- biro, so applicants pick it themselves (profile or application form).
CREATE TABLE employee_bureaus (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT NOT NULL REFERENCES employee_departments(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, department_id)
);
CREATE UNIQUE INDEX employee_bureaus_department_name_key
    ON employee_bureaus (department_id, lower(name));

ALTER TABLE applicants
    ADD COLUMN bureau_id BIGINT,
    ADD CONSTRAINT applicants_bureau_requires_department_check
        CHECK (bureau_id IS NULL OR department_id IS NOT NULL),
    ADD CONSTRAINT applicants_bureau_department_fkey
        FOREIGN KEY (bureau_id, department_id)
        REFERENCES employee_bureaus(id, department_id) ON DELETE RESTRICT;

CREATE INDEX applicants_bureau_id_idx ON applicants (bureau_id);
