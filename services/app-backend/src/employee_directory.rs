use super::jobs::validate_organization_name;
use super::*;

#[derive(FromRow, Serialize)]
struct EmployeeRecord {
    id: i64,
    employee_number: String,
    name: String,
    position_title: String,
    target_level: String,
    division_id: i64,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    division_name: String,
    department_name: String,
    unit_name: String,
    unit_type: String,
    is_active: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
pub(super) struct EmployeeFields {
    employee_number: String,
    name: String,
    position_title: String,
    target_level: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
}

#[derive(Deserialize)]
pub(super) struct EmployeeStatusRequest {
    is_active: bool,
}

#[derive(Serialize)]
pub(super) struct EmployeesResponse {
    data: Vec<EmployeeRecord>,
}

pub(super) async fn admin_list_employees(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<EmployeesResponse>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(EMPLOYEES_VIEW)?;
    let data = sqlx::query_as::<_, EmployeeRecord>(
        "SELECT employee_directory.id, employee_number, employee_directory.name, position_title, target_level, employee_directory.division_id, employee_directory.department_id, employee_directory.bureau_id, divisions.name AS division_name, COALESCE(departments.name, '') AS department_name, CASE target_level WHEN 'division' THEN '' WHEN 'secretariat' THEN divisions.secretariat_name WHEN 'department' THEN departments.name ELSE bureaus.name END AS unit_name, CASE WHEN target_level = 'bureau' THEN bureaus.unit_type ELSE target_level END AS unit_type, is_active, employee_directory.created_at::text AS created_at, employee_directory.updated_at::text AS updated_at FROM employee_directory JOIN divisions ON divisions.id = employee_directory.division_id LEFT JOIN departments ON departments.id = employee_directory.department_id LEFT JOIN bureaus ON bureaus.id = employee_directory.bureau_id WHERE ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND employee_directory.division_id = $2) OR ($1 = 'department_head' AND target_level IN ('department', 'bureau') AND employee_directory.department_id = $3)) ORDER BY employee_directory.name, employee_directory.employee_number",
    )
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(EmployeesResponse { data }))
}

pub(super) async fn admin_create_employee(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(fields): Json<EmployeeFields>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(EMPLOYEES_MANAGE)?;
    let fields = validate_employee_fields(fields)?;
    validate_employee_target(&state.pool, &fields).await?;
    ensure_can_manage_employee(&admin, &fields)?;

    match sqlx::query(
        "INSERT INTO employee_directory (employee_number, name, position_title, target_level, division_id, department_id, bureau_id, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)",
    )
    .bind(&fields.employee_number)
    .bind(&fields.name)
    .bind(&fields.position_title)
    .bind(&fields.target_level)
    .bind(fields.division_id)
    .bind(fields.department_id)
    .bind(fields.bureau_id)
    .bind(admin.id)
    .execute(&state.pool)
    .await
    {
        Ok(_) => Ok(Json(json!({ "message": "Data karyawan berhasil ditambahkan." }))),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("NIP karyawan sudah terdaftar."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

pub(super) async fn admin_update_employee(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(fields): Json<EmployeeFields>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(EMPLOYEES_MANAGE)?;
    let fields = validate_employee_fields(fields)?;
    validate_employee_target(&state.pool, &fields).await?;
    ensure_can_manage_employee(&admin, &fields)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM employee_directory WHERE id = $1 AND ($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND division_id = $3) OR ($2 = 'department_head' AND target_level IN ('department', 'bureau') AND department_id = $4)) FOR UPDATE",
    )
    .bind(id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?;
    if existing.is_none() {
        return Err(ApiError::NotFound("Data karyawan tidak ditemukan."));
    }
    let result = sqlx::query(
        "UPDATE employee_directory SET employee_number = $2, name = $3, position_title = $4, target_level = $5, division_id = $6, department_id = $7, bureau_id = $8, updated_by = $9, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(&fields.employee_number)
    .bind(&fields.name)
    .bind(&fields.position_title)
    .bind(&fields.target_level)
    .bind(fields.division_id)
    .bind(fields.department_id)
    .bind(fields.bureau_id)
    .bind(admin.id)
    .execute(&mut *transaction)
    .await;
    match result {
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("NIP karyawan sudah terdaftar."));
        }
        Err(error) => return Err(internal_error(error)),
    }
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Data karyawan berhasil diperbarui." }),
    ))
}

pub(super) async fn admin_set_employee_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<EmployeeStatusRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(EMPLOYEES_MANAGE)?;
    let result = sqlx::query(
        "UPDATE employee_directory SET is_active = $2, updated_by = $3, updated_at = NOW() WHERE id = $1 AND ($4 IN ('super_admin', 'admin') OR ($4 = 'division_head' AND division_id = $5) OR ($4 = 'department_head' AND target_level IN ('department', 'bureau') AND department_id = $6))",
    )
    .bind(id)
    .bind(request.is_active)
    .bind(admin.id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Data karyawan tidak ditemukan."));
    }
    Ok(Json(
        json!({ "message": "Status karyawan berhasil diperbarui." }),
    ))
}

fn validate_employee_fields(mut fields: EmployeeFields) -> Result<EmployeeFields, ApiError> {
    fields.employee_number = fields.employee_number.trim().to_owned();
    if fields.employee_number.is_empty()
        || fields.employee_number.len() > 40
        || fields.employee_number.chars().any(char::is_control)
    {
        return Err(ApiError::BadRequest(
            "NIP wajib diisi dan maksimal 40 karakter.",
        ));
    }
    fields.name = validate_organization_name(&fields.name)?;
    fields.position_title = validate_organization_name(&fields.position_title)?;
    let valid_target = match fields.target_level.as_str() {
        "division" | "secretariat" => {
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
            "Pilih unit kerja karyawan dengan benar.",
        ));
    }
    Ok(fields)
}

async fn validate_employee_target(pool: &PgPool, fields: &EmployeeFields) -> Result<(), ApiError> {
    let division_id = fields
        .division_id
        .ok_or(ApiError::BadRequest("Divisi wajib dipilih."))?;
    let valid = match fields.target_level.as_str() {
        "division" => {
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM divisions WHERE id = $1)")
                .bind(division_id)
                .fetch_one(pool)
                .await
                .map_err(internal_error)?
        }
        "secretariat" => {
            sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM divisions WHERE id = $1 AND btrim(secretariat_name) <> '')",
            )
            .bind(division_id)
            .fetch_one(pool)
            .await
            .map_err(internal_error)?
        }
        "department" => {
            sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM departments WHERE id = $1 AND division_id = $2)",
            )
            .bind(fields.department_id)
            .bind(division_id)
            .fetch_one(pool)
            .await
            .map_err(internal_error)?
        }
        "bureau" => {
            sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM bureaus JOIN departments ON departments.id = bureaus.department_id WHERE bureaus.id = $1 AND departments.id = $2 AND departments.division_id = $3)",
            )
            .bind(fields.bureau_id)
            .bind(fields.department_id)
            .bind(division_id)
            .fetch_one(pool)
            .await
            .map_err(internal_error)?
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(ApiError::BadRequest(
            "Unit karyawan tidak sesuai dengan struktur organisasi yang dipilih.",
        ))
    }
}

fn ensure_can_manage_employee(
    admin: &AdminContext,
    fields: &EmployeeFields,
) -> Result<(), ApiError> {
    let allowed = match admin.admin_role.as_str() {
        "super_admin" | "admin" => true,
        "division_head" => admin.division_id == fields.division_id,
        "department_head" => {
            matches!(fields.target_level.as_str(), "department" | "bureau")
                && admin.department_id == fields.department_id
        }
        _ => false,
    };
    if allowed {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn employee_fields(
        target_level: &str,
        division_id: i64,
        department_id: Option<i64>,
    ) -> EmployeeFields {
        EmployeeFields {
            employee_number: "NIP-1".to_owned(),
            name: "Nama".to_owned(),
            position_title: "Jabatan".to_owned(),
            target_level: target_level.to_owned(),
            division_id: Some(division_id),
            department_id,
            bureau_id: (target_level == "bureau").then_some(30),
        }
    }

    fn admin_context(
        admin_role: &str,
        division_id: Option<i64>,
        department_id: Option<i64>,
    ) -> AdminContext {
        AdminContext {
            id: 1,
            token_hash: String::new(),
            admin_role: admin_role.to_owned(),
            division_id,
            department_id,
            permissions: Vec::new(),
        }
    }

    #[test]
    fn employee_management_is_limited_to_admin_organization_scope() {
        let division_head = admin_context("division_head", Some(10), None);
        assert!(ensure_can_manage_employee(
            &division_head,
            &employee_fields("bureau", 10, Some(20))
        )
        .is_ok());
        assert!(matches!(
            ensure_can_manage_employee(
                &division_head,
                &employee_fields("department", 11, Some(21))
            ),
            Err(ApiError::Forbidden)
        ));

        let department_head = admin_context("department_head", None, Some(20));
        assert!(ensure_can_manage_employee(
            &department_head,
            &employee_fields("bureau", 10, Some(20))
        )
        .is_ok());
        assert!(matches!(
            ensure_can_manage_employee(&department_head, &employee_fields("secretariat", 10, None)),
            Err(ApiError::Forbidden)
        ));
        assert!(matches!(
            ensure_can_manage_employee(&department_head, &employee_fields("bureau", 10, Some(21))),
            Err(ApiError::Forbidden)
        ));
    }
}
