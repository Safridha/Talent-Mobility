CREATE TABLE application_status_notifications (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    applicant_id BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL
        CHECK (previous_status IN ('submitted', 'screening', 'interview', 'accepted', 'rejected')),
    new_status TEXT NOT NULL
        CHECK (new_status IN ('submitted', 'screening', 'interview', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX application_status_notifications_applicant_created_idx
    ON application_status_notifications (applicant_id, created_at DESC, id DESC);
