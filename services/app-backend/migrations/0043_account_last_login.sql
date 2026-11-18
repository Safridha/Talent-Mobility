ALTER TABLE applicants
    ADD COLUMN last_login_at TIMESTAMPTZ,
    ADD COLUMN last_seen_at TIMESTAMPTZ;

ALTER TABLE admins
    ADD COLUMN last_login_at TIMESTAMPTZ,
    ADD COLUMN last_seen_at TIMESTAMPTZ;

UPDATE applicants
SET last_login_at = latest.created_at, last_seen_at = latest.created_at
FROM (SELECT applicant_id, MAX(created_at) AS created_at FROM applicant_tokens GROUP BY applicant_id) AS latest
WHERE latest.applicant_id = applicants.id;

UPDATE admins
SET last_login_at = latest.created_at, last_seen_at = latest.created_at
FROM (SELECT admin_id, MAX(created_at) AS created_at FROM admin_tokens GROUP BY admin_id) AS latest
WHERE latest.admin_id = admins.id;
