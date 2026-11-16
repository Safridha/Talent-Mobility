-- Split "Kelola akun pelamar" into independently grantable actions.
-- applicant_accounts.manage stays the base grant (menu, list, create, import, activate/deactivate,
-- roster master data); edit, reset password and permanent delete are separate checklist items.
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
            'applicant_accounts.manage',
            'applicant_accounts.edit',
            'applicant_accounts.reset_password',
            'applicant_accounts.delete'
        )
    );

-- Keep what existing operational admins could already do: they could edit and reset passwords.
-- Permanent delete is new and irreversible, so nobody receives it automatically.
INSERT INTO admin_permissions (admin_id, permission_key)
SELECT existing.admin_id, sub.permission_key
FROM admin_permissions AS existing
CROSS JOIN (VALUES ('applicant_accounts.edit'), ('applicant_accounts.reset_password')) AS sub(permission_key)
WHERE existing.permission_key = 'applicant_accounts.manage'
ON CONFLICT DO NOTHING;
