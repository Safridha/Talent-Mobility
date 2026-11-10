ALTER TABLE applications
    ADD COLUMN employee_number TEXT,
    ADD COLUMN applicant_full_name TEXT,
    ADD COLUMN origin_division TEXT,
    ADD COLUMN origin_unit TEXT,
    ADD COLUMN education_level TEXT,
    ADD COLUMN study_field TEXT;

CREATE INDEX applications_employee_number_idx
    ON applications (employee_number);
