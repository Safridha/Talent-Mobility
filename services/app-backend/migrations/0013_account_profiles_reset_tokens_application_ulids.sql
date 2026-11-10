ALTER TABLE applicants
    ADD COLUMN profile_photo BYTEA,
    ADD COLUMN profile_photo_content_type TEXT,
    ADD CONSTRAINT applicants_profile_photo_pair_check
        CHECK ((profile_photo IS NULL) = (profile_photo_content_type IS NULL)),
    ADD CONSTRAINT applicants_profile_photo_type_check
        CHECK (profile_photo_content_type IS NULL OR profile_photo_content_type IN ('image/jpeg', 'image/png', 'image/webp'));

ALTER TABLE admins
    ADD COLUMN profile_photo BYTEA,
    ADD COLUMN profile_photo_content_type TEXT,
    ADD CONSTRAINT admins_profile_photo_pair_check
        CHECK ((profile_photo IS NULL) = (profile_photo_content_type IS NULL)),
    ADD CONSTRAINT admins_profile_photo_type_check
        CHECK (profile_photo_content_type IS NULL OR profile_photo_content_type IN ('image/jpeg', 'image/png', 'image/webp'));

ALTER TABLE applications
    ADD COLUMN public_id TEXT,
    ADD CONSTRAINT applications_public_id_format_check
        CHECK (public_id IS NULL OR public_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$');

CREATE UNIQUE INDEX applications_public_id_idx
    ON applications(public_id);

CREATE TABLE password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    applicant_id BIGINT REFERENCES applicants(id) ON DELETE CASCADE,
    admin_id BIGINT REFERENCES admins(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT password_reset_tokens_single_account_check
        CHECK (num_nonnulls(applicant_id, admin_id) = 1)
);

CREATE INDEX password_reset_tokens_applicant_idx
    ON password_reset_tokens(applicant_id, created_at DESC)
    WHERE applicant_id IS NOT NULL;

CREATE INDEX password_reset_tokens_admin_idx
    ON password_reset_tokens(admin_id, created_at DESC)
    WHERE admin_id IS NOT NULL;
