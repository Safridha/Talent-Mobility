use super::*;

#[derive(Deserialize)]
pub(super) struct EmployeeDivisionRequest {
    name: String,
}

#[derive(Deserialize)]
pub(super) struct EmployeeDepartmentRequest {
    division_id: i64,
    name: String,
}

#[derive(Deserialize)]
pub(super) struct EmployeeBureauRequest {
    department_id: i64,
    name: String,
}

fn master_name(value: &str) -> Result<String, ApiError> {
    let name = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() || name.chars().count() > 200 {
        return Err(ApiError::BadRequest(
            "Nama wajib diisi dan maksimal 200 karakter.",
        ));
    }
    Ok(name)
}

fn master_write_error(error: sqlx::Error, duplicate: &'static str, in_use: &'static str) -> ApiError {
    if is_unique_violation(&error) {
        ApiError::Conflict(duplicate)
    } else if is_foreign_key_violation(&error) {
        ApiError::Conflict(in_use)
    } else {
        internal_error(error)
    }
}

pub(super) async fn admin_list_employee_master(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_operational_admin(&state.pool, &headers)
        .await?
        .require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let divisions = sqlx::query_as::<_, (i64, String, i64)>(
        "SELECT employee_divisions.id, employee_divisions.name, (SELECT COUNT(*) FROM applicants WHERE applicants.division_id = employee_divisions.id)::BIGINT FROM employee_divisions ORDER BY lower(employee_divisions.name)",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let departments = sqlx::query_as::<_, (i64, i64, String, i64)>(
        "SELECT employee_departments.id, employee_departments.division_id, employee_departments.name, (SELECT COUNT(*) FROM applicants WHERE applicants.department_id = employee_departments.id)::BIGINT FROM employee_departments ORDER BY lower(employee_departments.name)",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let bureaus = sqlx::query_as::<_, (i64, i64, String, i64)>(
        "SELECT employee_bureaus.id, employee_bureaus.department_id, employee_bureaus.name, (SELECT COUNT(*) FROM applicants WHERE applicants.bureau_id = employee_bureaus.id)::BIGINT FROM employee_bureaus ORDER BY lower(employee_bureaus.name)",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(json!({
        "divisions": divisions.iter().map(|(id, name, accounts)| json!({ "id": id, "name": name, "accounts_count": accounts })).collect::<Vec<_>>(),
        "departments": departments.iter().map(|(id, division_id, name, accounts)| json!({ "id": id, "division_id": division_id, "name": name, "accounts_count": accounts })).collect::<Vec<_>>(),
        "bureaus": bureaus.iter().map(|(id, department_id, name, accounts)| json!({ "id": id, "department_id": department_id, "name": name, "accounts_count": accounts })).collect::<Vec<_>>(),
    })))
}

pub(super) async fn admin_create_employee_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<EmployeeDivisionRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let name = master_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let id = sqlx::query_scalar::<_, i64>("INSERT INTO employee_divisions (name) VALUES ($1) RETURNING id")
        .bind(&name)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| master_write_error(error, "Divisi sudah ada.", "Divisi tidak dapat disimpan."))?;
    record_admin_audit(&mut transaction, admin.id, "create", "employee_division", &id.to_string(), json!({ "name": name }))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Divisi ditambahkan.", "id": id })))
}

pub(super) async fn admin_update_employee_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<EmployeeDivisionRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let name = master_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("UPDATE employee_divisions SET name = $1 WHERE id = $2")
        .bind(&name)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| master_write_error(error, "Divisi dengan nama itu sudah ada.", "Divisi tidak dapat disimpan."))?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Divisi tidak ditemukan."));
    }
    record_admin_audit(&mut transaction, admin.id, "update", "employee_division", &id.to_string(), json!({ "name": name }))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Divisi diperbarui." })))
}

pub(super) async fn admin_delete_employee_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("DELETE FROM employee_divisions WHERE id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| master_write_error(error, "Divisi sudah ada.", "Divisi masih memiliki departemen atau dipakai akun pelamar."))?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Divisi tidak ditemukan."));
    }
    record_admin_audit(&mut transaction, admin.id, "delete", "employee_division", &id.to_string(), json!({}))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Divisi dihapus." })))
}

pub(super) async fn admin_create_employee_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<EmployeeDepartmentRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let name = master_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO employee_departments (division_id, name) VALUES ($1, $2) RETURNING id",
    )
    .bind(request.division_id)
    .bind(&name)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| master_write_error(error, "Departemen sudah ada di divisi ini.", "Divisi tidak ditemukan."))?;
    record_admin_audit(&mut transaction, admin.id, "create", "employee_department", &id.to_string(), json!({ "name": name, "division_id": request.division_id }))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Departemen ditambahkan.", "id": id })))
}

pub(super) async fn admin_update_employee_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<EmployeeDepartmentRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let name = master_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("UPDATE employee_departments SET name = $1, division_id = $2 WHERE id = $3")
        .bind(&name)
        .bind(request.division_id)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            master_write_error(
                error,
                "Departemen dengan nama itu sudah ada di divisi tersebut.",
                "Departemen masih dipakai akun pelamar, divisinya tidak dapat dipindahkan.",
            )
        })?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Departemen tidak ditemukan."));
    }
    record_admin_audit(&mut transaction, admin.id, "update", "employee_department", &id.to_string(), json!({ "name": name, "division_id": request.division_id }))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Departemen diperbarui." })))
}

pub(super) async fn admin_delete_employee_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("DELETE FROM employee_departments WHERE id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| master_write_error(error, "Departemen sudah ada.", "Departemen masih memiliki biro atau dipakai akun pelamar."))?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Departemen tidak ditemukan."));
    }
    record_admin_audit(&mut transaction, admin.id, "delete", "employee_department", &id.to_string(), json!({}))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Departemen dihapus." })))
}

/// Divisi/Departemen choices for an applicant editing their own roster details.
pub(super) async fn account_list_employee_master(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let account = authorized_account(&state.pool, &headers).await?;
    if account.role != "applicant" {
        return Err(ApiError::Forbidden);
    }
    let divisions = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, name FROM employee_divisions ORDER BY lower(name)",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let departments = sqlx::query_as::<_, (i64, i64, String)>(
        "SELECT id, division_id, name FROM employee_departments ORDER BY lower(name)",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let bureaus = sqlx::query_as::<_, (i64, i64, String)>(
        "SELECT id, department_id, name FROM employee_bureaus ORDER BY lower(name)",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(json!({
        "divisions": divisions.iter().map(|(id, name)| json!({ "id": id, "name": name })).collect::<Vec<_>>(),
        "departments": departments.iter().map(|(id, division_id, name)| json!({ "id": id, "division_id": division_id, "name": name })).collect::<Vec<_>>(),
        "bureaus": bureaus.iter().map(|(id, department_id, name)| json!({ "id": id, "department_id": department_id, "name": name })).collect::<Vec<_>>(),
    })))
}

pub(super) async fn admin_create_employee_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<EmployeeBureauRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let name = master_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO employee_bureaus (department_id, name) VALUES ($1, $2) RETURNING id",
    )
    .bind(request.department_id)
    .bind(&name)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| master_write_error(error, "Biro sudah ada di departemen ini.", "Departemen tidak ditemukan."))?;
    record_admin_audit(&mut transaction, admin.id, "create", "employee_bureau", &id.to_string(), json!({ "name": name, "department_id": request.department_id }))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Biro ditambahkan.", "id": id })))
}

pub(super) async fn admin_update_employee_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<EmployeeBureauRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let name = master_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("UPDATE employee_bureaus SET name = $1, department_id = $2 WHERE id = $3")
        .bind(&name)
        .bind(request.department_id)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            master_write_error(
                error,
                "Biro dengan nama itu sudah ada di departemen tersebut.",
                "Biro masih dipakai akun pelamar, departemennya tidak dapat dipindahkan.",
            )
        })?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Biro tidak ditemukan."));
    }
    record_admin_audit(&mut transaction, admin.id, "update", "employee_bureau", &id.to_string(), json!({ "name": name, "department_id": request.department_id }))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Biro diperbarui." })))
}

pub(super) async fn admin_delete_employee_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("DELETE FROM employee_bureaus WHERE id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| master_write_error(error, "Biro sudah ada.", "Biro masih dipakai akun pelamar."))?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Biro tidak ditemukan."));
    }
    record_admin_audit(&mut transaction, admin.id, "delete", "employee_bureau", &id.to_string(), json!({}))
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Biro dihapus." })))
}
