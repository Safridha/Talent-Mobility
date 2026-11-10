use std::collections::HashSet;

use super::ApiError;

pub(super) const JOBS_VIEW: &str = "jobs.view";
pub(super) const JOBS_CREATE: &str = "jobs.create";
pub(super) const JOBS_UPDATE: &str = "jobs.update";
pub(super) const JOBS_DELETE: &str = "jobs.delete";
pub(super) const JOBS_CHANGE_STATUS: &str = "jobs.change_status";
pub(super) const APPLICATIONS_VIEW: &str = "applications.view";
pub(super) const APPLICATIONS_CHANGE_STATUS: &str = "applications.change_status";
pub(super) const APPLICATIONS_DOWNLOAD_DOCUMENTS: &str = "applications.download_documents";
pub(super) const JOB_TYPES_MANAGE: &str = "job_types.manage";
pub(super) const APPLICANT_ACCOUNTS_MANAGE: &str = "applicant_accounts.manage";
pub(super) const EMPLOYEES_VIEW: &str = "employees.view";
pub(super) const EMPLOYEES_MANAGE: &str = "employees.manage";

const SCOPED_PERMISSION_KEYS: [&str; 10] = [
    JOBS_VIEW,
    JOBS_CREATE,
    JOBS_UPDATE,
    JOBS_DELETE,
    JOBS_CHANGE_STATUS,
    APPLICATIONS_VIEW,
    APPLICATIONS_CHANGE_STATUS,
    APPLICATIONS_DOWNLOAD_DOCUMENTS,
    EMPLOYEES_VIEW,
    EMPLOYEES_MANAGE,
];

const OPERATIONAL_PERMISSION_KEYS: [&str; 12] = [
    JOBS_VIEW,
    JOBS_CREATE,
    JOBS_UPDATE,
    JOBS_DELETE,
    JOBS_CHANGE_STATUS,
    APPLICATIONS_VIEW,
    APPLICATIONS_CHANGE_STATUS,
    APPLICATIONS_DOWNLOAD_DOCUMENTS,
    JOB_TYPES_MANAGE,
    APPLICANT_ACCOUNTS_MANAGE,
    EMPLOYEES_VIEW,
    EMPLOYEES_MANAGE,
];

const DEFAULT_SCOPED_PERMISSION_KEYS: [&str; 8] = [
    JOBS_VIEW,
    JOBS_CREATE,
    JOBS_UPDATE,
    JOBS_DELETE,
    JOBS_CHANGE_STATUS,
    APPLICATIONS_VIEW,
    APPLICATIONS_CHANGE_STATUS,
    APPLICATIONS_DOWNLOAD_DOCUMENTS,
];

const DEFAULT_OPERATIONAL_PERMISSION_KEYS: [&str; 10] = [
    JOBS_VIEW,
    JOBS_CREATE,
    JOBS_UPDATE,
    JOBS_DELETE,
    JOBS_CHANGE_STATUS,
    APPLICATIONS_VIEW,
    APPLICATIONS_CHANGE_STATUS,
    APPLICATIONS_DOWNLOAD_DOCUMENTS,
    JOB_TYPES_MANAGE,
    APPLICANT_ACCOUNTS_MANAGE,
];

pub(super) fn default_permissions(role: &str) -> Vec<String> {
    let permissions: &[&str] = match role {
        "admin" => &DEFAULT_OPERATIONAL_PERMISSION_KEYS,
        "division_head" | "department_head" => &DEFAULT_SCOPED_PERMISSION_KEYS,
        _ => &[],
    };
    permissions
        .iter()
        .map(|permission| (*permission).to_owned())
        .collect()
}

pub(super) fn validate_admin_permissions(
    role: &str,
    permissions: &[String],
) -> Result<(), ApiError> {
    if role == "super_admin" {
        return if permissions.is_empty() {
            Ok(())
        } else {
            Err(ApiError::BadRequest(
                "Hak Super Admin selalu penuh dan tidak dapat diatur per akun.",
            ))
        };
    }
    let allowed_for_role: &[&str] = match role {
        "admin" => &OPERATIONAL_PERMISSION_KEYS,
        "division_head" | "department_head" => &SCOPED_PERMISSION_KEYS,
        _ => {
            return Err(ApiError::BadRequest("Peran admin tidak valid."));
        }
    };
    let allowed_keys = allowed_for_role.iter().copied().collect::<HashSet<_>>();
    let submitted = permissions
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    if submitted.len() != permissions.len()
        || submitted.iter().any(|key| !allowed_keys.contains(key))
    {
        return Err(ApiError::BadRequest(
            "Izin admin tidak valid untuk peran yang dipilih.",
        ));
    }

    let has = |permission: &str| submitted.contains(permission);
    if (has(JOBS_CREATE) || has(JOBS_UPDATE) || has(JOBS_DELETE) || has(JOBS_CHANGE_STATUS))
        && !has(JOBS_VIEW)
    {
        return Err(ApiError::BadRequest(
            "Izin mengelola lowongan membutuhkan izin melihat lowongan.",
        ));
    }
    if (has(APPLICATIONS_CHANGE_STATUS) || has(APPLICATIONS_DOWNLOAD_DOCUMENTS))
        && !has(APPLICATIONS_VIEW)
    {
        return Err(ApiError::BadRequest(
            "Izin proses dan dokumen membutuhkan izin melihat lamaran.",
        ));
    }
    if has(EMPLOYEES_MANAGE) && !has(EMPLOYEES_VIEW) {
        return Err(ApiError::BadRequest(
            "Izin mengelola karyawan membutuhkan izin melihat karyawan.",
        ));
    }
    if submitted.is_empty() {
        return Err(ApiError::BadRequest(
            "Pilih minimal satu hak akses untuk akun admin.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scoped_admin_permissions_cannot_grant_global_settings() {
        let permissions = vec![JOBS_VIEW.to_owned(), APPLICATIONS_VIEW.to_owned()];
        assert!(validate_admin_permissions("division_head", &permissions).is_ok());

        let mut permissions = permissions;
        permissions.push(JOB_TYPES_MANAGE.to_owned());
        assert!(validate_admin_permissions("division_head", &permissions).is_err());
    }

    #[test]
    fn write_permissions_require_read_access_and_are_unique() {
        assert!(validate_admin_permissions("admin", &[JOBS_CREATE.to_owned()]).is_err());
        assert!(
            validate_admin_permissions("admin", &[APPLICATIONS_CHANGE_STATUS.to_owned()]).is_err()
        );
        assert!(
            validate_admin_permissions("admin", &[JOBS_VIEW.to_owned(), JOBS_VIEW.to_owned()])
                .is_err()
        );
        assert!(validate_admin_permissions("admin", &[]).is_err());
    }

    #[test]
    fn role_defaults_preserve_existing_access() {
        assert!(default_permissions("division_head").contains(&APPLICATIONS_CHANGE_STATUS.into()));
        assert!(default_permissions("admin").contains(&APPLICANT_ACCOUNTS_MANAGE.into()));
        assert!(!default_permissions("admin").contains(&EMPLOYEES_VIEW.into()));
        assert!(default_permissions("super_admin").is_empty());
    }
}
