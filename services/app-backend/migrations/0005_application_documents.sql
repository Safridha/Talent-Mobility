ALTER TABLE applications
    ADD COLUMN phone_number TEXT,
    ADD COLUMN current_position TEXT,
    ADD COLUMN current_unit TEXT,
    ADD COLUMN motivation TEXT;

CREATE TABLE application_documents (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('cv', 'cover_letter', 'certificate')),
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type = 'application/pdf'),
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (application_id, document_type),
    CHECK (octet_length(content) = file_size)
);

CREATE INDEX application_documents_application_id_idx
    ON application_documents(application_id);
