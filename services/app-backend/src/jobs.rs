use super::*;

pub(super) async fn list_jobs(
    State(state): State<AppState>,
) -> Result<Json<JobsResponse>, ApiError> {
    let data = sqlx::query_as::<_, Job>(
        "SELECT job_postings.id, title, division, department, unit, CASE WHEN target_level = 'bureau' THEN bureaus.unit_type ELSE target_level END AS unit_type, target_level, job_postings.division_id, job_postings.department_id, job_postings.bureau_id, location, quota, posted, job_types.name AS job_type, summary, skills, responsibilities, status, NULL::BOOLEAN AS has_applications FROM job_postings JOIN job_types ON job_types.id = job_postings.job_type_id LEFT JOIN bureaus ON bureaus.id = job_postings.bureau_id WHERE status = 'open' ORDER BY job_postings.id",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(JobsResponse { data }))
}

pub(super) async fn admin_list_jobs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<JobsResponse>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(JOBS_VIEW)?;
    let data = sqlx::query_as::<_, Job>(
        "SELECT job_postings.id, title, division, department, unit, CASE WHEN target_level = 'bureau' THEN bureaus.unit_type ELSE target_level END AS unit_type, target_level, job_postings.division_id, job_postings.department_id, job_postings.bureau_id, location, quota, posted, job_types.name AS job_type, summary, skills, responsibilities, status, EXISTS(SELECT 1 FROM applications WHERE applications.job_id = job_postings.id) AS has_applications FROM job_postings JOIN job_types ON job_types.id = job_postings.job_type_id LEFT JOIN bureaus ON bureaus.id = job_postings.bureau_id WHERE ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND job_postings.division_id = $2) OR ($1 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $3)) ORDER BY job_postings.id",
    )
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(JobsResponse { data }))
}

pub(super) async fn admin_create_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateAdminJobRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(JOBS_CREATE)?;
    let id = request.id.trim();
    let fields = request.fields;
    validate_admin_job(id, &fields)?;
    let organization = resolve_job_target(&state.pool, &fields).await?;
    ensure_can_manage_job_target(&admin, &fields, &organization)?;
    let job_type_id = resolve_job_type_id(&state.pool, &fields.job_type).await?;
    let result = sqlx::query(
        "INSERT INTO job_postings (id, title, division, department, unit, target_level, division_id, department_id, bureau_id, location, quota, posted, job_type_id, summary, skills, responsibilities) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
    )
    .bind(id)
    .bind(fields.title.trim())
    .bind(organization.division)
    .bind(organization.department)
    .bind(organization.unit)
    .bind(&fields.target_level)
    .bind(organization.division_id)
    .bind(organization.department_id)
    .bind(organization.bureau_id)
    .bind(fields.location.trim())
    .bind(fields.quota)
    .bind(fields.posted.trim())
    .bind(job_type_id)
    .bind(fields.summary.trim())
    .bind(SqlJson(fields.skills))
    .bind(SqlJson(fields.responsibilities))
    .execute(&state.pool)
    .await;

    match result {
        Ok(_) => Ok(Json(json!({ "message": "Lowongan berhasil dibuat." }))),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("Kode posisi sudah digunakan."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_update_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(fields): Json<AdminJobFields>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(JOBS_UPDATE)?;
    validate_admin_job(&id, &fields)?;
    let organization = resolve_job_target(&state.pool, &fields).await?;
    ensure_can_manage_job_target(&admin, &fields, &organization)?;
    let job_type_id = resolve_job_type_id(&state.pool, &fields.job_type).await?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let existing = sqlx::query_as::<_, (String, i64, Option<i64>, Option<i64>)>(
        "SELECT target_level, division_id, department_id, bureau_id FROM job_postings WHERE id = $1 AND ($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND division_id = $3) OR ($2 = 'department_head' AND target_level <> 'division' AND department_id = $4)) FOR UPDATE",
    )
    .bind(&id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Lowongan tidak ditemukan."))?;
    let has_applications: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM applications WHERE job_id = $1)")
            .bind(&id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(internal_error)?;
    if has_applications
        && (existing.0 != fields.target_level
            || existing.1 != organization.division_id
            || existing.2 != organization.department_id
            || existing.3 != organization.bureau_id)
    {
        return Err(ApiError::Conflict(
            "Target organisasi tidak dapat diubah setelah lowongan menerima lamaran.",
        ));
    }
    let result = sqlx::query(
        "UPDATE job_postings SET title = $2, division = $3, department = $4, unit = $5, target_level = $6, division_id = $7, department_id = $8, bureau_id = $9, location = $10, quota = $11, posted = $12, job_type_id = $13, summary = $14, skills = $15, responsibilities = $16 WHERE id = $1",
    )
    .bind(&id)
    .bind(fields.title.trim())
    .bind(organization.division)
    .bind(organization.department)
    .bind(organization.unit)
    .bind(&fields.target_level)
    .bind(organization.division_id)
    .bind(organization.department_id)
    .bind(organization.bureau_id)
    .bind(fields.location.trim())
    .bind(fields.quota)
    .bind(fields.posted.trim())
    .bind(job_type_id)
    .bind(fields.summary.trim())
    .bind(SqlJson(fields.skills))
    .bind(SqlJson(fields.responsibilities))
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Lowongan tidak ditemukan."));
    }
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Lowongan berhasil diperbarui." })))
}

pub(super) async fn admin_delete_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(JOBS_DELETE)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let job_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM job_postings WHERE id = $1 AND ($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND division_id = $3) OR ($2 = 'department_head' AND target_level <> 'division' AND department_id = $4)) FOR UPDATE",
    )
    .bind(&id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Lowongan tidak ditemukan."))?;
    let has_applications: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM applications WHERE job_id = $1)")
            .bind(&job_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(internal_error)?;
    if has_applications {
        return Err(ApiError::Conflict(
            "Lowongan sudah memiliki lamaran dan hanya dapat ditutup.",
        ));
    }

    sqlx::query("DELETE FROM job_postings WHERE id = $1")
        .bind(job_id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Lowongan berhasil dihapus." })))
}

pub(super) async fn admin_set_job_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<JobStatusRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(JOBS_CHANGE_STATUS)?;
    if !is_valid_job_status_update(&request.status) {
        return Err(ApiError::BadRequest(
            "Status lowongan hanya dapat diubah menjadi open atau closed.",
        ));
    }
    let result = sqlx::query("UPDATE job_postings SET status = $2 WHERE id = $1 AND ($3 IN ('super_admin', 'admin') OR ($3 = 'division_head' AND division_id = $4) OR ($3 = 'department_head' AND target_level <> 'division' AND department_id = $5))")
        .bind(id)
        .bind(request.status)
        .bind(&admin.admin_role)
        .bind(admin.division_id)
        .bind(admin.department_id)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Lowongan tidak ditemukan."));
    }
    Ok(Json(
        json!({ "message": "Status lowongan berhasil diperbarui." }),
    ))
}

pub(super) fn is_valid_job_status_update(status: &str) -> bool {
    matches!(status, "open" | "closed")
}

pub(super) async fn admin_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminDashboardMetrics>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_any_permission(&[JOBS_VIEW, APPLICATIONS_VIEW])?;
    let metrics = sqlx::query_as::<_, AdminDashboardMetrics>(
        "WITH visible_jobs AS (SELECT id, status FROM job_postings WHERE ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND division_id = $2) OR ($1 = 'department_head' AND target_level <> 'division' AND department_id = $3))), visible_applications AS (SELECT applications.status FROM applications JOIN visible_jobs ON visible_jobs.id = applications.job_id) SELECT CASE WHEN $4 THEN (SELECT COUNT(*) FROM visible_jobs) ELSE 0 END AS positions_total, CASE WHEN $4 THEN (SELECT COUNT(*) FROM visible_jobs WHERE status = 'draft') ELSE 0 END AS positions_draft, CASE WHEN $4 THEN (SELECT COUNT(*) FROM visible_jobs WHERE status = 'open') ELSE 0 END AS positions_open, CASE WHEN $4 THEN (SELECT COUNT(*) FROM visible_jobs WHERE status = 'closed') ELSE 0 END AS positions_closed, CASE WHEN $5 THEN (SELECT COUNT(*) FROM visible_applications) ELSE 0 END AS applications_total, CASE WHEN $5 THEN (SELECT COUNT(*) FROM visible_applications WHERE status = 'submitted') ELSE 0 END AS applications_submitted, CASE WHEN $5 THEN (SELECT COUNT(*) FROM visible_applications WHERE status = 'screening') ELSE 0 END AS applications_screening, CASE WHEN $5 THEN (SELECT COUNT(*) FROM visible_applications WHERE status = 'interview') ELSE 0 END AS applications_interview, CASE WHEN $5 THEN (SELECT COUNT(*) FROM visible_applications WHERE status = 'accepted') ELSE 0 END AS applications_accepted, CASE WHEN $5 THEN (SELECT COUNT(*) FROM visible_applications WHERE status = 'rejected') ELSE 0 END AS applications_rejected",
    )
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .bind(admin.has_permission(JOBS_VIEW))
    .bind(admin.has_permission(APPLICATIONS_VIEW))
    .fetch_one(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(metrics))
}

pub(super) async fn admin_list_job_types(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_any_permission(&[JOBS_VIEW, JOB_TYPES_MANAGE])?;
    let data = sqlx::query_as::<_, JobTypeRecord>(
        "SELECT job_types.id, job_types.name, COUNT(job_postings.id) AS job_count FROM job_types LEFT JOIN job_postings ON job_postings.job_type_id = job_types.id AND ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND job_postings.division_id = $2) OR ($1 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $3)) GROUP BY job_types.id ORDER BY lower(job_types.name), job_types.name",
    )
    .bind(admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(json!({ "data": data })))
}

pub(super) async fn admin_create_job_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<JobTypeNameRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_operational_admin(&state.pool, &headers)
        .await?
        .require_permission(JOB_TYPES_MANAGE)?;
    let name = validate_job_type_name(&request.name)?;
    match sqlx::query("INSERT INTO job_types (name) VALUES ($1)")
        .bind(name)
        .execute(&state.pool)
        .await
    {
        Ok(_) => Ok(Json(
            json!({ "message": "Jenis pekerjaan berhasil ditambahkan." }),
        )),
        Err(error) if is_unique_violation(&error) => Err(ApiError::Conflict(
            "Jenis pekerjaan tersebut sudah terdaftar.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_update_job_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<JobTypeNameRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_operational_admin(&state.pool, &headers)
        .await?
        .require_permission(JOB_TYPES_MANAGE)?;
    let name = validate_job_type_name(&request.name)?;
    let result = sqlx::query("UPDATE job_types SET name = $2 WHERE id = $1")
        .bind(id)
        .bind(name)
        .execute(&state.pool)
        .await;
    match result {
        Ok(result) if result.rows_affected() == 0 => {
            Err(ApiError::NotFound("Jenis pekerjaan tidak ditemukan."))
        }
        Ok(_) => Ok(Json(
            json!({ "message": "Jenis pekerjaan berhasil diperbarui." }),
        )),
        Err(error) if is_unique_violation(&error) => Err(ApiError::Conflict(
            "Jenis pekerjaan tersebut sudah terdaftar.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_delete_job_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_operational_admin(&state.pool, &headers)
        .await?
        .require_permission(JOB_TYPES_MANAGE)?;
    match sqlx::query("DELETE FROM job_types WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
    {
        Ok(result) if result.rows_affected() == 0 => {
            Err(ApiError::NotFound("Jenis pekerjaan tidak ditemukan."))
        }
        Ok(_) => Ok(Json(
            json!({ "message": "Jenis pekerjaan berhasil dihapus." }),
        )),
        Err(error) if is_foreign_key_violation(&error) => Err(ApiError::Conflict(
            "Jenis pekerjaan masih digunakan oleh lowongan. Ubah jenis pada lowongan terkait terlebih dahulu.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_list_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<OrganizationResponse>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_any_permission(&[JOBS_CREATE, JOBS_UPDATE, EMPLOYEES_VIEW])?;
    let divisions = sqlx::query_as::<_, DivisionRecord>(
        "SELECT id, name, description, secretariat_name, secretariat_description FROM divisions WHERE ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND id = $2) OR ($1 = 'department_head' AND id = (SELECT division_id FROM departments WHERE id = $3))) ORDER BY name",
    )
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let departments = sqlx::query_as::<_, DepartmentRecord>(
        "SELECT id, division_id, name, description FROM departments WHERE ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND division_id = $2) OR ($1 = 'department_head' AND id = $3)) ORDER BY name",
    )
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let bureaus = sqlx::query_as::<_, BureauRecord>(
        "SELECT id, department_id, name, description, unit_type FROM bureaus WHERE ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND department_id IN (SELECT id FROM departments WHERE division_id = $2)) OR ($1 = 'department_head' AND department_id = $3)) ORDER BY name",
    )
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(OrganizationResponse {
        divisions,
        departments,
        bureaus,
    }))
}

pub(super) async fn public_list_organization(
    State(state): State<AppState>,
) -> Result<Json<PublicOrganizationResponse>, ApiError> {
    let divisions = sqlx::query_as::<_, PublicDivisionRecord>(
        "SELECT id, name, secretariat_name FROM divisions ORDER BY name",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let departments = sqlx::query_as::<_, PublicDepartmentRecord>(
        "SELECT id, division_id, name FROM departments ORDER BY name",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let bureaus = sqlx::query_as::<_, PublicBureauRecord>(
        "SELECT id, department_id, name, unit_type FROM bureaus ORDER BY name",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(PublicOrganizationResponse {
        divisions,
        departments,
        bureaus,
    }))
}

pub(super) async fn admin_create_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<DivisionRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let description = validate_organization_description(&request.description)?;
    let secretariat_name = validate_optional_organization_name(&request.secretariat_name)?;
    let secretariat_description =
        validate_organization_description(&request.secretariat_description)?;
    match sqlx::query(
        "INSERT INTO divisions (name, description, secretariat_name, secretariat_description) VALUES ($1, $2, $3, $4)",
    )
        .bind(name)
        .bind(description)
        .bind(secretariat_name)
        .bind(secretariat_description)
        .execute(&state.pool)
        .await
    {
        Ok(_) => Ok(Json(json!({ "message": "Divisi berhasil ditambahkan." }))),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("Nama divisi sudah digunakan."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_update_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<DivisionRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let description = validate_organization_description(&request.description)?;
    let secretariat_name = validate_optional_organization_name(&request.secretariat_name)?;
    let secretariat_description =
        validate_organization_description(&request.secretariat_description)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    if secretariat_name.is_empty() {
        let secretariat_is_in_use: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM job_postings WHERE division_id = $1 AND target_level = 'secretariat' UNION ALL SELECT 1 FROM employee_directory WHERE division_id = $1 AND target_level = 'secretariat')",
        )
        .bind(id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(internal_error)?;
        if secretariat_is_in_use {
            return Err(ApiError::Conflict(
                "Sekretariat masih digunakan oleh lowongan atau direktori karyawan.",
            ));
        }
    }
    let result = sqlx::query(
        "UPDATE divisions SET name = $2, description = $3, secretariat_name = $4, secretariat_description = $5 WHERE id = $1",
    )
        .bind(id)
        .bind(&name)
        .bind(description)
        .bind(&secretariat_name)
        .bind(secretariat_description)
        .execute(&mut *transaction)
        .await;
    match result {
        Ok(result) if result.rows_affected() == 0 => {
            return Err(ApiError::NotFound("Divisi tidak ditemukan."));
        }
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Nama divisi sudah digunakan."));
        }
        Err(error) => return Err(internal_error(error)),
    }
    sqlx::query("UPDATE job_postings SET division = $2 WHERE division_id = $1")
        .bind(id)
        .bind(&name)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    sqlx::query(
        "UPDATE job_postings SET unit = $2 WHERE division_id = $1 AND target_level = 'secretariat'",
    )
    .bind(id)
    .bind(secretariat_name)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Divisi berhasil diperbarui." })))
}

pub(super) async fn admin_delete_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    match sqlx::query("DELETE FROM divisions WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
    {
        Ok(result) if result.rows_affected() == 0 => {
            Err(ApiError::NotFound("Divisi tidak ditemukan."))
        }
        Ok(_) => Ok(Json(json!({ "message": "Divisi berhasil dihapus." }))),
        Err(error) if is_foreign_key_violation(&error) => Err(ApiError::Conflict(
            "Divisi masih digunakan oleh departemen, lowongan, akun admin, atau direktori karyawan. Hapus atau pindahkan data terkait terlebih dahulu.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_create_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateDepartmentRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let description = validate_organization_description(&request.description)?;
    let division_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM divisions WHERE id = $1)")
            .bind(request.division_id)
            .fetch_one(&state.pool)
            .await
            .map_err(internal_error)?;
    if !division_exists {
        return Err(ApiError::BadRequest("Divisi yang dipilih tidak ditemukan."));
    }
    match sqlx::query(
        "INSERT INTO departments (division_id, name, description) VALUES ($1, $2, $3)",
    )
    .bind(request.division_id)
    .bind(name)
    .bind(description)
    .execute(&state.pool)
    .await
    {
        Ok(_) => Ok(Json(
            json!({ "message": "Departemen berhasil ditambahkan." }),
        )),
        Err(error) if is_unique_violation(&error) => Err(ApiError::Conflict(
            "Nama departemen sudah ada di divisi ini.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_update_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<OrganizationNameRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let description = validate_organization_description(&request.description)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("UPDATE departments SET name = $2, description = $3 WHERE id = $1")
        .bind(id)
        .bind(&name)
        .bind(description)
        .execute(&mut *transaction)
        .await;
    match result {
        Ok(result) if result.rows_affected() == 0 => {
            return Err(ApiError::NotFound("Departemen tidak ditemukan."));
        }
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict(
                "Nama departemen sudah ada di divisi ini.",
            ));
        }
        Err(error) => return Err(internal_error(error)),
    }
    sqlx::query("UPDATE job_postings SET department = $2 WHERE department_id = $1")
        .bind(id)
        .bind(name)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Departemen berhasil diperbarui." }),
    ))
}

pub(super) async fn admin_delete_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    match sqlx::query("DELETE FROM departments WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
    {
        Ok(result) if result.rows_affected() == 0 => {
            Err(ApiError::NotFound("Departemen tidak ditemukan."))
        }
        Ok(_) => Ok(Json(json!({ "message": "Departemen berhasil dihapus." }))),
        Err(error) if is_foreign_key_violation(&error) => Err(ApiError::Conflict(
            "Departemen masih memiliki biro/bengkel atau digunakan oleh lowongan, akun admin, atau direktori karyawan.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_create_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateBureauRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let description = validate_organization_description(&request.description)?;
    let unit_type = validate_bureau_unit_type(&request.unit_type)?;
    let department_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM departments WHERE id = $1)")
            .bind(request.department_id)
            .fetch_one(&state.pool)
            .await
            .map_err(internal_error)?;
    if !department_exists {
        return Err(ApiError::BadRequest(
            "Departemen yang dipilih tidak ditemukan.",
        ));
    }
    match sqlx::query(
        "INSERT INTO bureaus (department_id, name, description, unit_type) VALUES ($1, $2, $3, $4)",
    )
    .bind(request.department_id)
    .bind(name)
    .bind(description)
    .bind(unit_type)
    .execute(&state.pool)
    .await
    {
        Ok(_) => Ok(Json(json!({ "message": "Biro berhasil ditambahkan." }))),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("Nama biro sudah ada di departemen ini."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_update_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<BureauUpdateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let description = validate_organization_description(&request.description)?;
    let unit_type = validate_bureau_unit_type(&request.unit_type)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result =
        sqlx::query("UPDATE bureaus SET name = $2, description = $3, unit_type = $4 WHERE id = $1")
            .bind(id)
            .bind(&name)
            .bind(description)
            .bind(unit_type)
            .execute(&mut *transaction)
            .await;
    match result {
        Ok(result) if result.rows_affected() == 0 => {
            return Err(ApiError::NotFound("Biro tidak ditemukan."));
        }
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Nama biro sudah ada di departemen ini."));
        }
        Err(error) => return Err(internal_error(error)),
    }
    sqlx::query("UPDATE job_postings SET unit = $2 WHERE bureau_id = $1")
        .bind(id)
        .bind(name)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Biro berhasil diperbarui." })))
}

pub(super) async fn admin_delete_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    match sqlx::query("DELETE FROM bureaus WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
    {
        Ok(result) if result.rows_affected() == 0 => {
            Err(ApiError::NotFound("Biro tidak ditemukan."))
        }
        Ok(_) => Ok(Json(json!({ "message": "Biro berhasil dihapus." }))),
        Err(error) if is_foreign_key_violation(&error) => Err(ApiError::Conflict(
            "Biro/bengkel masih digunakan oleh lowongan atau direktori karyawan. Pindahkan data terkait terlebih dahulu.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

struct JobTargetPath {
    division_id: i64,
    division: String,
    department_id: Option<i64>,
    department: String,
    bureau_id: Option<i64>,
    unit: String,
}

async fn resolve_job_target(
    pool: &PgPool,
    fields: &AdminJobFields,
) -> Result<JobTargetPath, ApiError> {
    match fields.target_level.as_str() {
        "division" if fields.department_id.is_none() && fields.bureau_id.is_none() => {
            let division_id = fields
                .division_id
                .ok_or(ApiError::BadRequest("Divisi wajib dipilih."))?;
            let division =
                sqlx::query_scalar::<_, String>("SELECT name FROM divisions WHERE id = $1")
                    .bind(division_id)
                    .fetch_optional(pool)
                    .await
                    .map_err(internal_error)?
                    .ok_or(ApiError::BadRequest("Divisi yang dipilih tidak ditemukan."))?;
            Ok(JobTargetPath {
                division_id,
                division,
                department_id: None,
                department: String::new(),
                bureau_id: None,
                unit: String::new(),
            })
        }
        "secretariat" if fields.department_id.is_none() && fields.bureau_id.is_none() => {
            let division_id = fields
                .division_id
                .ok_or(ApiError::BadRequest("Divisi wajib dipilih."))?;
            let names = sqlx::query_as::<_, (String, String)>(
                "SELECT name, secretariat_name FROM divisions WHERE id = $1 AND btrim(secretariat_name) <> ''",
            )
            .bind(division_id)
            .fetch_optional(pool)
            .await
            .map_err(internal_error)?
            .ok_or(ApiError::BadRequest(
                "Divisi yang dipilih belum memiliki sekretariat.",
            ))?;
            Ok(JobTargetPath {
                division_id,
                division: names.0,
                department_id: None,
                department: String::new(),
                bureau_id: None,
                unit: names.1,
            })
        }
        "department" if fields.bureau_id.is_none() => {
            let division_id = fields
                .division_id
                .ok_or(ApiError::BadRequest("Divisi wajib dipilih."))?;
            let department_id = fields
                .department_id
                .ok_or(ApiError::BadRequest("Departemen wajib dipilih."))?;
            let path = sqlx::query_as::<_, (String, String)>(
                "SELECT divisions.name, departments.name FROM departments JOIN divisions ON divisions.id = departments.division_id WHERE departments.id = $1 AND divisions.id = $2",
            )
            .bind(department_id)
            .bind(division_id)
            .fetch_optional(pool)
            .await
            .map_err(internal_error)?
            .ok_or(ApiError::BadRequest(
                "Departemen tidak berada pada divisi yang dipilih.",
            ))?;
            Ok(JobTargetPath {
                division_id,
                division: path.0,
                department_id: Some(department_id),
                department: path.1,
                bureau_id: None,
                unit: String::new(),
            })
        }
        "bureau" => {
            let division_id = fields
                .division_id
                .ok_or(ApiError::BadRequest("Divisi wajib dipilih."))?;
            let department_id = fields
                .department_id
                .ok_or(ApiError::BadRequest("Departemen wajib dipilih."))?;
            let bureau_id = fields
                .bureau_id
                .ok_or(ApiError::BadRequest("Biro wajib dipilih."))?;
            let path = sqlx::query_as::<_, (String, String, String)>(
                "SELECT divisions.name, departments.name, bureaus.name FROM bureaus JOIN departments ON departments.id = bureaus.department_id JOIN divisions ON divisions.id = departments.division_id WHERE bureaus.id = $1 AND departments.id = $2 AND divisions.id = $3",
            )
            .bind(bureau_id)
            .bind(department_id)
            .bind(division_id)
            .fetch_optional(pool)
            .await
            .map_err(internal_error)?
            .ok_or(ApiError::BadRequest(
                "Biro tidak berada pada struktur organisasi yang dipilih.",
            ))?;
            Ok(JobTargetPath {
                division_id,
                division: path.0,
                department_id: Some(department_id),
                department: path.1,
                bureau_id: Some(bureau_id),
                unit: path.2,
            })
        }
        _ => Err(ApiError::BadRequest(
            "Tingkat target lowongan atau struktur organisasinya tidak valid.",
        )),
    }
}

fn validate_bureau_unit_type(unit_type: &str) -> Result<&'static str, ApiError> {
    match unit_type {
        "biro" => Ok("biro"),
        "bengkel" => Ok("bengkel"),
        _ => Err(ApiError::BadRequest(
            "Jenis unit harus berupa biro atau bengkel.",
        )),
    }
}

fn ensure_can_manage_job_target(
    admin: &AdminContext,
    fields: &AdminJobFields,
    target: &JobTargetPath,
) -> Result<(), ApiError> {
    if can_manage_job_target(admin, &fields.target_level, target) {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

fn can_manage_job_target(admin: &AdminContext, target_level: &str, target: &JobTargetPath) -> bool {
    match admin.admin_role.as_str() {
        "super_admin" | "admin" => true,
        "division_head" => admin.division_id == Some(target.division_id),
        "department_head" => {
            target_level != "division" && admin.department_id == target.department_id
        }
        _ => false,
    }
}

pub(super) fn validate_organization_name(name: &str) -> Result<String, ApiError> {
    let name = name.trim();
    if name.is_empty() || name.len() > 160 {
        return Err(ApiError::BadRequest(
            "Nama wajib diisi dan maksimal 160 karakter.",
        ));
    }
    Ok(name.to_owned())
}

pub(super) fn validate_optional_organization_name(name: &str) -> Result<String, ApiError> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(String::new());
    }
    validate_organization_name(name)
}

pub(super) fn validate_organization_description(description: &str) -> Result<String, ApiError> {
    let description = description.trim();
    if description.chars().count() > 4000 {
        return Err(ApiError::BadRequest("Deskripsi maksimal 4000 karakter."));
    }
    Ok(description.to_owned())
}

pub(super) fn validate_job_type_name(name: &str) -> Result<String, ApiError> {
    let name = name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(ApiError::BadRequest(
            "Nama jenis pekerjaan wajib diisi dan maksimal 80 karakter.",
        ));
    }
    Ok(name.to_owned())
}

async fn resolve_job_type_id(pool: &PgPool, name: &str) -> Result<i64, ApiError> {
    sqlx::query_scalar("SELECT id FROM job_types WHERE name = $1")
        .bind(name.trim())
        .fetch_optional(pool)
        .await
        .map_err(internal_error)?
        .ok_or(ApiError::BadRequest(
            "Pilih jenis pekerjaan dari daftar yang tersedia.",
        ))
}

pub(super) fn validate_admin_job(id: &str, fields: &AdminJobFields) -> Result<(), ApiError> {
    if id.trim().is_empty() || id.len() > 64 {
        return Err(ApiError::BadRequest(
            "Kode posisi wajib diisi dan maksimal 64 karakter.",
        ));
    }

    if [
        fields.title.trim(),
        fields.location.trim(),
        fields.posted.trim(),
        fields.job_type.trim(),
        fields.summary.trim(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(ApiError::BadRequest("Semua detail lowongan wajib diisi."));
    }
    if fields.quota < 0 {
        return Err(ApiError::BadRequest("Kuota tidak boleh negatif."));
    }
    if fields.skills.is_empty()
        || fields
            .skills
            .iter()
            .any(|specification| specification.trim().is_empty())
    {
        return Err(ApiError::BadRequest(
            "Setidaknya satu spesifikasi internal wajib diisi.",
        ));
    }
    if fields.responsibilities.is_empty()
        || fields
            .responsibilities
            .iter()
            .any(|responsibility| responsibility.trim().is_empty())
    {
        return Err(ApiError::BadRequest(
            "Setidaknya satu deskripsi tugas wajib diisi.",
        ));
    }
    let valid_target = match fields.target_level.as_str() {
        "division" => {
            fields.division_id.is_some()
                && fields.department_id.is_none()
                && fields.bureau_id.is_none()
        }
        "secretariat" => {
            fields.division_id.is_some()
                && fields.department_id.is_none()
                && fields.bureau_id.is_none()
        }
        "department" => {
            fields.division_id.is_some()
                && fields.department_id.is_some()
                && fields.bureau_id.is_none()
        }
        "bureau" => {
            fields.division_id.is_some()
                && fields.department_id.is_some()
                && fields.bureau_id.is_some()
        }
        _ => false,
    };
    if !valid_target {
        return Err(ApiError::BadRequest(
            "Pilih target lowongan dan struktur organisasinya dengan benar.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn admin_context(
        role: &str,
        division_id: Option<i64>,
        department_id: Option<i64>,
    ) -> AdminContext {
        AdminContext {
            id: 1,
            token_hash: String::new(),
            admin_role: role.to_owned(),
            division_id,
            department_id,
            permissions: Vec::new(),
        }
    }

    fn target(division_id: i64, department_id: Option<i64>) -> JobTargetPath {
        JobTargetPath {
            division_id,
            division: String::new(),
            department_id,
            department: String::new(),
            bureau_id: None,
            unit: String::new(),
        }
    }

    #[test]
    fn scoped_job_permissions_never_expand_organization_scope() {
        let division_head = admin_context("division_head", Some(7), None);
        assert!(can_manage_job_target(
            &division_head,
            "bureau",
            &target(7, Some(21))
        ));
        assert!(!can_manage_job_target(
            &division_head,
            "bureau",
            &target(8, Some(22))
        ));

        let department_head = admin_context("department_head", None, Some(21));
        assert!(can_manage_job_target(
            &department_head,
            "bureau",
            &target(7, Some(21))
        ));
        assert!(!can_manage_job_target(
            &department_head,
            "bureau",
            &target(7, Some(22))
        ));
        assert!(!can_manage_job_target(
            &department_head,
            "division",
            &target(7, None)
        ));
    }
}
