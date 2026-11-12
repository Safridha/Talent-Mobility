-- Tidy the relational structure for the current flow (see docs/database.md).

-- 1. Remove leftovers that no code uses any more.
--    employees/api_tokens come from the very first schema; employee_directory (and its
--    employees.* permissions) was replaced by applicant accounts + employee_* master data.
DROP TABLE IF EXISTS api_tokens;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS employee_directory;

DELETE FROM admin_permissions WHERE permission_key IN ('employees.view', 'employees.manage');
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
            'applicant_accounts.manage'
        )
    );

-- 2. Sign-in is by NIP for applicants and admins alike, so a NIP must be unique across both tables.
CREATE FUNCTION enforce_unique_employee_number() RETURNS trigger AS $$
BEGIN
    IF NEW.employee_number IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'applicants' THEN
        IF EXISTS (SELECT 1 FROM admins WHERE employee_number = NEW.employee_number) THEN
            RAISE EXCEPTION 'NIP % sudah dipakai akun admin', NEW.employee_number USING ERRCODE = '23505';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM applicants WHERE employee_number = NEW.employee_number) THEN
            RAISE EXCEPTION 'NIP % sudah dipakai akun pelamar', NEW.employee_number USING ERRCODE = '23505';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applicants_employee_number_unique
    BEFORE INSERT OR UPDATE OF employee_number ON applicants
    FOR EACH ROW EXECUTE FUNCTION enforce_unique_employee_number();
CREATE TRIGGER admins_employee_number_unique
    BEFORE INSERT OR UPDATE OF employee_number ON admins
    FOR EACH ROW EXECUTE FUNCTION enforce_unique_employee_number();

-- 3. Emails are stored lower-case by the application; keep the database honest too.
--    NOT VALID: enforced for new/changed rows without rescanning (existing rows are already lower-case).
ALTER TABLE applicants
    ADD CONSTRAINT applicants_email_lowercase_check CHECK (email IS NULL OR email = lower(email)) NOT VALID;
ALTER TABLE admins
    ADD CONSTRAINT admins_email_lowercase_check CHECK (email = lower(email)) NOT VALID;

-- 4. Document the model inside the database as well.
COMMENT ON TABLE divisions IS 'Organization hierarchy for job/application TARGETS (Unit Kerja menu): divisions > departments > bureaus.';
COMMENT ON TABLE departments IS 'Organization hierarchy level 2 (target units).';
COMMENT ON TABLE bureaus IS 'Organization hierarchy level 3 (target biro/bengkel).';
COMMENT ON TABLE employee_divisions IS 'Employee roster master data (Master Data tab): where applicants work now. Level 1.';
COMMENT ON TABLE employee_departments IS 'Employee roster master data, level 2 (the roster "Unit Kerja").';
COMMENT ON TABLE employee_bureaus IS 'Employee roster master data, level 3 (biro/bengkel), filled by admins/applicants; not in the Excel roster.';
COMMENT ON TABLE applicants IS 'Applicant accounts = the employee roster. Sign in by employee_number (NIP). Division/department/bureau reference employee_* master data.';
COMMENT ON TABLE applications IS 'Applications. origin_* columns are text snapshots of the applicant roster data at apply time; target_* reference the organization hierarchy.';
COMMENT ON COLUMN applicants.employee_number IS 'NIP. Unique across applicants and admins (trigger).';
COMMENT ON COLUMN applicants.email IS 'Optional contact email; not used to sign in.';
