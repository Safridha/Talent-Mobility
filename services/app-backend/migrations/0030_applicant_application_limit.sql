CREATE TABLE applicant_application_limit (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    max_applications INTEGER NOT NULL CHECK (max_applications BETWEEN 1 AND 10000),
    updated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
