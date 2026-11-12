ALTER TABLE admins
    ADD COLUMN employee_number TEXT UNIQUE
        CHECK (employee_number IS NULL OR length(employee_number) BETWEEN 1 AND 40);
