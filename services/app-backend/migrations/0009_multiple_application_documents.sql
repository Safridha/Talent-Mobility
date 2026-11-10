ALTER TABLE application_documents
    DROP CONSTRAINT application_documents_document_type_check,
    ADD CONSTRAINT application_documents_document_type_check
        CHECK (document_type IN ('cv', 'cover_letter', 'certificate', 'supporting_document')),
    DROP CONSTRAINT application_documents_application_id_document_type_key;
