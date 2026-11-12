-- Master data for the employee roster used by applicant accounts (separate from the
-- job-target organization hierarchy). "Unit Kerja" in the roster is a Departemen.
CREATE TABLE employee_divisions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX employee_divisions_name_key ON employee_divisions (lower(name));

CREATE TABLE employee_departments (
    id BIGSERIAL PRIMARY KEY,
    division_id BIGINT NOT NULL REFERENCES employee_divisions(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, division_id)
);
CREATE UNIQUE INDEX employee_departments_division_name_key
    ON employee_departments (division_id, lower(name));

ALTER TABLE applicants
    ADD COLUMN employee_number TEXT UNIQUE
        CHECK (employee_number IS NULL OR length(employee_number) BETWEEN 1 AND 40),
    ADD COLUMN division_id BIGINT REFERENCES employee_divisions(id) ON DELETE RESTRICT,
    ADD COLUMN department_id BIGINT,
    ADD COLUMN position_title TEXT CHECK (position_title IS NULL OR length(position_title) <= 200),
    ADD COLUMN last_education TEXT CHECK (last_education IS NULL OR length(last_education) <= 80),
    ADD CONSTRAINT applicants_department_division_fkey
        FOREIGN KEY (department_id, division_id)
        REFERENCES employee_departments(id, division_id) ON DELETE RESTRICT;

CREATE INDEX applicants_division_id_idx ON applicants (division_id);
CREATE INDEX applicants_department_id_idx ON applicants (department_id);
