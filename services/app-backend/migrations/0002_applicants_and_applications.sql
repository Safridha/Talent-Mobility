CREATE TABLE applicants (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE applicant_tokens (
    token_hash TEXT PRIMARY KEY,
    applicant_id BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE applications (
    id BIGSERIAL PRIMARY KEY,
    applicant_id BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (applicant_id, job_id)
);
