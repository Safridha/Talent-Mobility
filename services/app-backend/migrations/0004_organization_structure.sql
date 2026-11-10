CREATE TABLE divisions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE departments (
    id BIGSERIAL PRIMARY KEY,
    division_id BIGINT NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    UNIQUE (division_id, name)
);

CREATE TABLE bureaus (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    UNIQUE (department_id, name)
);

INSERT INTO divisions (name)
SELECT DISTINCT division
FROM job_postings
ORDER BY division;

INSERT INTO departments (division_id, name)
SELECT DISTINCT divisions.id, job_postings.department
FROM job_postings
JOIN divisions ON divisions.name = job_postings.division
ORDER BY divisions.id, job_postings.department;

INSERT INTO bureaus (department_id, name)
SELECT DISTINCT departments.id, job_postings.unit
FROM job_postings
JOIN divisions ON divisions.name = job_postings.division
JOIN departments
  ON departments.division_id = divisions.id
 AND departments.name = job_postings.department
ORDER BY departments.id, job_postings.unit;

ALTER TABLE job_postings ADD COLUMN bureau_id BIGINT;

UPDATE job_postings
SET bureau_id = bureaus.id
FROM divisions
JOIN departments
  ON departments.division_id = divisions.id
JOIN bureaus
  ON bureaus.department_id = departments.id
WHERE job_postings.division = divisions.name
  AND job_postings.department = departments.name
  AND job_postings.unit = bureaus.name;

ALTER TABLE job_postings
    ALTER COLUMN bureau_id SET NOT NULL,
    ADD CONSTRAINT job_postings_bureau_id_fkey
        FOREIGN KEY (bureau_id) REFERENCES bureaus(id) ON DELETE RESTRICT;

CREATE INDEX departments_division_id_idx ON departments(division_id);
CREATE INDEX bureaus_department_id_idx ON bureaus(department_id);
CREATE INDEX job_postings_bureau_id_idx ON job_postings(bureau_id);
