CREATE TABLE admin_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate')),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_audit_events_created_at_id_idx
    ON admin_audit_events (created_at DESC, id DESC);
