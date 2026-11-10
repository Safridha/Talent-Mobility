ALTER TABLE admins
    DROP CONSTRAINT admins_scope_matches_role_check,
    DROP CONSTRAINT admins_admin_role_check;

DELETE FROM admin_tokens
WHERE admin_id IN (SELECT id FROM admins WHERE admin_role = 'bureau_admin');
DELETE FROM password_reset_tokens
WHERE admin_id IN (SELECT id FROM admins WHERE admin_role = 'bureau_admin');

UPDATE admins
SET admin_role = 'department_head',
    department_id = bureaus.department_id,
    bureau_id = NULL,
    is_active = FALSE
FROM bureaus
WHERE admins.admin_role = 'bureau_admin'
  AND bureaus.id = admins.bureau_id;

UPDATE admins SET admin_role = 'division_head'
WHERE admin_role = 'division_admin';
UPDATE admins SET admin_role = 'department_head'
WHERE admin_role = 'department_admin';

DROP INDEX admins_division_scope_idx;
DROP INDEX admins_department_scope_idx;
DROP INDEX admins_bureau_scope_idx;

ALTER TABLE admins
    ADD CONSTRAINT admins_admin_role_check
        CHECK (admin_role IN ('super_admin', 'admin', 'division_head', 'department_head')),
    ADD CONSTRAINT admins_scope_matches_role_check CHECK (
        (admin_role IN ('super_admin', 'admin') AND division_id IS NULL AND department_id IS NULL AND bureau_id IS NULL)
        OR (admin_role = 'division_head' AND division_id IS NOT NULL AND department_id IS NULL AND bureau_id IS NULL)
        OR (admin_role = 'department_head' AND division_id IS NULL AND department_id IS NOT NULL AND bureau_id IS NULL)
    );

CREATE INDEX admins_division_head_scope_idx
    ON admins (division_id)
    WHERE admin_role = 'division_head' AND is_active = TRUE;
CREATE INDEX admins_department_head_scope_idx
    ON admins (department_id)
    WHERE admin_role = 'department_head' AND is_active = TRUE;
