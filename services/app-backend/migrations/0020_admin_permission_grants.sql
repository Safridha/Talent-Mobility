CREATE TABLE admin_permissions (
    admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL CHECK (
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
    ),
    PRIMARY KEY (admin_id, permission_key)
);

INSERT INTO admin_permissions (admin_id, permission_key)
SELECT admins.id, permissions.permission_key
FROM admins
CROSS JOIN unnest(ARRAY[
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
]) AS permissions(permission_key)
WHERE admins.admin_role = 'admin';

INSERT INTO admin_permissions (admin_id, permission_key)
SELECT admins.id, permissions.permission_key
FROM admins
CROSS JOIN unnest(ARRAY[
    'jobs.view',
    'jobs.create',
    'jobs.update',
    'jobs.delete',
    'jobs.change_status',
    'applications.view',
    'applications.change_status',
    'applications.download_documents'
]) AS permissions(permission_key)
WHERE admins.admin_role IN ('division_head', 'department_head');
